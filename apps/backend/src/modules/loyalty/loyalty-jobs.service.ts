import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { addMonths, utcDateKey } from './domain/dates'
import { draftEarn, type EarnRowDraft } from './domain/earn'
import { draftExpiries, expiryReminders, reminderEventId } from './domain/expiry'
import { TIER_WINDOW_MONTHS, nextMemberTier, qualifyingTier, tierChanged, tierStats, type TierActivity } from './domain/tier'
import type { EarnRule, LedgerRow, MemberTier, TierCode, TransactionType } from './domain/types'
import type { JobRunResultDto } from './dto/responses'
import { LoyaltyAwardService } from './loyalty-award.service'
import { LoyaltyError, isCheckViolation } from './loyalty-error'
import { LoyaltyDataService } from './loyalty-data.service'

/** The jobs `POST /staff/loyalty/jobs/:name/run` accepts. upgrade waits on feature 3b's `upgradeCoupon`. */
export const JOB_NAMES = ['earn', 'tier', 'expire', 'return-to-cash', 'upgrade'] as const
export type JobName = (typeof JOB_NAMES)[number]
const AVAILABLE_JOBS: readonly JobName[] = ['earn', 'tier', 'expire', 'return-to-cash']

export const isJobName = (name: string): name is JobName => (JOB_NAMES as readonly string[]).includes(name)

/** Rows read per query, so one run never loads the whole ledger at once. */
export const JOB_BATCH = 500

/** inbound_event.source for every Feature 11 message (feature 13 routes it to the member's customer). */
export const EVENT_SOURCE = '11'

interface EarnCandidateRow {
  coupon_id: string
  member_id: string
  joined_at: Date
  fare_class_id: string | null
  distance_km: number
  arr_at: Date
  flight_status: string
  is_lap_infant: boolean
}

const MEMBER_FOR_TIER = {
  id: true,
  customer_id: true,
  tier_code: true,
  tier_qualified_at: true,
  tier_expires_at: true,
  customer: { select: { passenger_id: true, passenger: { select: { first_name: true, last_name: true } } } },
} satisfies Prisma.loyalty_memberSelect

type TierMemberRow = Prisma.loyalty_memberGetPayload<{ select: typeof MEMBER_FOR_TIER }>

const passengerName = (m: { customer: { passenger: { first_name: string; last_name: string } } }) =>
  `${m.customer.passenger.first_name} ${m.customer.passenger.last_name}`.trim()

/**
 * The Feature 11 background jobs. Every run reads `now` from the simulation clock and the rules and settings at run
 * time, and every write is safe to repeat:
 *
 *   - earn:   one `earn` row per boarded, paying coupon (UNIQUE (booking_coupon_id, type)), then a tier pass for the
 *             members who earned.
 *   - tier:   re-evaluates members on the rolling 12 months; a change of tier sends `tier_changed`.
 *   - expire: one `expire` row per credit past its `expires_at` (UNIQUE (expired_transaction_id, member_id)), then one
 *             `miles_expiring` reminder per member and expiry date. Messages go through feature 13's `inbound_event`,
 *             whose UNIQUE (source, source_event_id) makes a repeat a no-op, so Feature 11 records nothing.
 *
 *   - return-to-cash: inside `award_cutoff_hours` of departure, lowers `award_limit` to the award seats in use
 *             (`LoyaltyAwardService.returnToCash`), so unredeemed award seats sell for cash.
 *
 * A job never runs twice at once in this process; the second call answers 409 JOB_RUNNING.
 */
@Injectable()
export class LoyaltyJobsService {
  private readonly logger = new Logger(LoyaltyJobsService.name)
  private readonly running = new Set<JobName>()

  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly clock: SimulationClock,
    private readonly awards: LoyaltyAwardService,
  ) {}

  async run(name: JobName): Promise<JobRunResultDto> {
    if (!AVAILABLE_JOBS.includes(name)) {
      throw new LoyaltyError(
        HttpStatus.NOT_IMPLEMENTED,
        'JOB_NOT_AVAILABLE',
        `The ${name} job needs feature 3b's upgradeCoupon method, which is not built yet.`,
      )
    }
    if (this.running.has(name)) {
      throw new LoyaltyError(HttpStatus.CONFLICT, 'JOB_RUNNING', `The ${name} job is already running. Try again when it finishes.`)
    }
    this.running.add(name)
    const now = this.clock.now()
    try {
      const counts =
        name === 'earn'
          ? await this.earn(now)
          : name === 'tier'
            ? await this.tier(now)
            : name === 'return-to-cash'
              ? await this.awards.returnToCash(now)
              : await this.expire(now)
      this.logger.log(`${name} job at ${now.toISOString()}: ${JSON.stringify(counts)}`)
      return { job: name, ranAt: now.toISOString(), counts }
    } finally {
      this.running.delete(name)
    }
  }

  isRunning(name: JobName): boolean {
    return this.running.has(name)
  }

  // --- Earn ---------------------------------------------------------------------------------------------------

  /**
   * Sweeps flights whose planned `arr_at` has passed. The query already keeps only coupons that can earn (confirmed,
   * boarded in feature 6, not a lap infant or award seat, a fare class with a multiplier above 0, a member who had
   * joined by arrival, no earn row yet, flight neither cancelled nor diverted); `draftEarn` checks the same rules again
   * and computes the miles. Pages by (arr_at, coupon id), so a coupon that earns 0 miles never blocks the next page.
   */
  private async earn(now: Date): Promise<Record<string, number>> {
    const [settings, rules] = await Promise.all([this.data.settings(), this.earnRules()])
    let after: { arrAt: Date; couponId: string } | null = null
    let scanned = 0
    let written = 0
    let skipped = 0
    const earnedBy = new Set<string>()

    for (;;) {
      const rows: EarnCandidateRow[] = await this.earnCandidates(now, after)
      if (rows.length === 0) break
      scanned += rows.length

      const drafts: (EarnRowDraft & { memberId: string })[] = []
      for (const row of rows) {
        const result = draftEarn(
          {
            bookingCouponId: row.coupon_id,
            fareClassId: row.fare_class_id,
            distanceKm: row.distance_km,
            isLapInfant: row.is_lap_infant,
            boarded: true,
            flightCancelled: row.flight_status === 'cancelled',
            arrAt: row.arr_at,
          },
          rules,
          row.joined_at,
          now,
        )
        if ('skip' in result) skipped += 1
        else drafts.push({ ...result.draft, memberId: row.member_id })
      }

      if (drafts.length > 0) {
        const { count } = await this.db.loyalty_transaction.createMany({
          data: drafts.map((d) => ({
            member_id: d.memberId,
            type: 'earn',
            miles: d.miles,
            booking_coupon_id: d.bookingCouponId,
            distance_km: d.distanceKm,
            fare_class_id: d.fareClassId,
            multiplier: d.multiplier,
            expires_at: addMonths(d.occurredAt, settings.milesRetentionMonths),
            occurred_at: d.occurredAt,
          })),
          skipDuplicates: true, // a concurrent run or a repeat already wrote it
        })
        written += count
        drafts.forEach((d) => earnedBy.add(d.memberId))
      }

      const last = rows[rows.length - 1]
      after = { arrAt: last.arr_at, couponId: last.coupon_id }
      if (rows.length < JOB_BATCH) break
    }

    const tier = earnedBy.size > 0 ? await this.tier(now, [...earnedBy]) : { evaluated: 0, changed: 0, notified: 0 }
    return { scanned, earned: written, skipped, members: earnedBy.size, tierChanged: tier.changed, tierNotified: tier.notified }
  }

  private earnCandidates(now: Date, after: { arrAt: Date; couponId: string } | null): Promise<EarnCandidateRow[]> {
    const afterArr = after?.arrAt ?? new Date(0)
    const afterId = after?.couponId ?? '00000000-0000-0000-0000-000000000000'
    return this.db.$queryRaw<EarnCandidateRow[]>`
      SELECT c.id AS coupon_id, m.id AS member_id, m.joined_at, s.fare_class_id, r.distance_km, f.arr_at,
             f.status AS flight_status, (bp.lap_of_id IS NOT NULL) AS is_lap_infant
        FROM booking_coupon c
        JOIN booking_segment s    ON s.id = c.booking_segment_id
        JOIN booking b            ON b.id = c.booking_id
        JOIN booking_passenger bp ON bp.id = c.booking_passenger_id
        JOIN flight f             ON f.id = c.flight_id
        JOIN route r              ON r.id = f.route_id
        JOIN loyalty_member m     ON m.customer_id = b.customer_id
        JOIN loyalty_earn_rule er ON er.fare_class_id = s.fare_class_id AND er.multiplier > 0
       WHERE c.status = 'confirmed'
         AND f.arr_at <= ${now}
         AND f.arr_at >= m.joined_at
         AND f.status NOT IN ('cancelled', 'diverted')
         AND f.actual_destination IS NULL
         AND bp.lap_of_id IS NULL
         AND EXISTS (SELECT 1 FROM check_in ci
                      WHERE ci.booking_passenger_id = c.booking_passenger_id AND ci.flight_id = c.flight_id AND ci.status = 'boarded')
         AND NOT EXISTS (SELECT 1 FROM loyalty_transaction t WHERE t.booking_coupon_id = c.id AND t.type = 'earn')
         AND (f.arr_at, c.id) > (${afterArr}, ${afterId}::uuid)
       ORDER BY f.arr_at, c.id
       LIMIT ${JOB_BATCH}`
  }

  private async earnRules(): Promise<Map<string, EarnRule>> {
    const rows = await this.db.loyalty_earn_rule.findMany({ select: { fare_class_id: true, multiplier: true } })
    return new Map(rows.map((r) => [r.fare_class_id, { fareClassId: r.fare_class_id, multiplier: r.multiplier.toFixed(2) }]))
  }

  // --- Tier ---------------------------------------------------------------------------------------------------

  /**
   * Re-evaluates the given members, or every member when none are given. Miles count every earn row in the rolling
   * 12 months; flights count only coupons the member flew personally. `nextMemberTier` applies the doc's rule: a tier at
   * least as high as the current one starts a new validity period, a lower result never cuts it short, and an expired
   * tier falls to what the member qualifies for now. A new tier code sends `tier_changed`; a renewal of the same tier
   * or a drop to no tier updates the row without a message.
   */
  async tier(now: Date, memberIds?: string[]): Promise<{ evaluated: number; changed: number; notified: number }> {
    const rules = await this.data.tierRules()
    const windowStart = addMonths(now, -TIER_WINDOW_MONTHS)
    let cursor: string | undefined
    let evaluated = 0
    let changed = 0
    let notified = 0

    for (;;) {
      const members: TierMemberRow[] = await this.db.loyalty_member.findMany({
        where: memberIds ? { id: { in: memberIds } } : undefined,
        orderBy: { id: 'asc' },
        take: JOB_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: MEMBER_FOR_TIER,
      })
      if (members.length === 0) break
      evaluated += members.length

      const earns = await this.db.loyalty_transaction.findMany({
        where: { member_id: { in: members.map((m) => m.id) }, type: 'earn', occurred_at: { gt: windowStart, lte: now } },
        select: { member_id: true, miles: true, occurred_at: true, booking_coupon: { select: { passenger_id: true } } },
      })
      const activity = new Map<string, TierActivity[]>()
      const ownPassenger = new Map(members.map((m) => [m.id, m.customer.passenger_id]))
      for (const e of earns) {
        const list = activity.get(e.member_id) ?? []
        list.push({
          miles: e.miles,
          occurredAt: e.occurred_at,
          flownBySelf: e.booking_coupon?.passenger_id === ownPassenger.get(e.member_id),
        })
        activity.set(e.member_id, list)
      }

      for (const m of members) {
        const before: MemberTier = {
          tierCode: m.tier_code as TierCode | null,
          tierQualifiedAt: m.tier_qualified_at,
          tierExpiresAt: m.tier_expires_at,
        }
        const qualified = qualifyingTier(tierStats(activity.get(m.id) ?? [], now), rules)
        const after = nextMemberTier(before, qualified, rules, now)
        if (!tierChanged(before, after)) continue

        const rule = after.tierCode ? rules.find((r) => r.code === after.tierCode) : undefined
        const event: Prisma.inbound_eventCreateManyInput | null =
          after.tierCode !== before.tierCode && rule && after.tierQualifiedAt && after.tierExpiresAt
            ? {
                source: EVENT_SOURCE,
                source_event_id: `tier_changed:${m.id}:${after.tierQualifiedAt.toISOString()}`,
                event_type: 'tier_changed',
                payload: {
                  customer_id: m.customer_id,
                  member_id: m.id,
                  passenger_name: passengerName(m),
                  tier_code: rule.code,
                  tier_name: rule.name,
                  tier_expires_on: utcDateKey(after.tierExpiresAt),
                },
                received_at: now,
              }
            : null
        await this.db.$transaction(async (tx) => {
          await tx.loyalty_member.update({
            where: { id: m.id },
            data: {
              tier_code: after.tierCode,
              tier_qualified_at: after.tierQualifiedAt,
              tier_expires_at: after.tierExpiresAt,
              updated_at: new Date(), // real time, like every updated_at
            },
            select: { id: true },
          })
          if (event) {
            const { count } = await tx.inbound_event.createMany({ data: [event], skipDuplicates: true })
            notified += count
          }
        })
        changed += 1
      }

      cursor = members[members.length - 1].id
      if (members.length < JOB_BATCH) break
    }
    return { evaluated, changed, notified }
  }

  // --- Expire and reminders ------------------------------------------------------------------------------------

  /**
   * Finds members with a credit (earn or positive adjust) that expires before the end of the reminder window and has
   * no expire row yet, then for each one: writes the expire rows `draftExpiries` allocates (debits use the earliest
   * credits first), and queues one `miles_expiring` reminder per expiry date still ahead in the window. A member whose
   * expiry would take the balance below 0 (a concurrent spend) is skipped and picked up on the next run.
   */
  private async expire(now: Date): Promise<Record<string, number>> {
    const settings = await this.data.settings()
    const until = new Date(now.getTime() + settings.expiryReminderDays * 86_400_000)
    let cursor: string | undefined
    let members = 0
    let expiredRows = 0
    let expiredMiles = 0
    let reminders = 0
    let failed = 0

    for (;;) {
      const batch = await this.db.loyalty_member.findMany({
        where: {
          loyalty_transaction: {
            some: {
              expires_at: { lte: until },
              other_loyalty_transaction_loyalty_transaction_expired_transaction_id_member_idToloyalty_transaction: { is: null },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: JOB_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, customer_id: true, customer: { select: { passenger: { select: { first_name: true, last_name: true } } } } },
      })
      if (batch.length === 0) break
      members += batch.length

      const rows = await this.db.loyalty_transaction.findMany({
        where: { member_id: { in: batch.map((m) => m.id) } },
        orderBy: { seq: 'asc' },
        select: {
          id: true,
          member_id: true,
          type: true,
          miles: true,
          occurred_at: true,
          expires_at: true,
          expired_transaction_id: true,
          reversed_transaction_id: true,
        },
      })
      const ledgers = new Map<string, LedgerRow[]>()
      for (const r of rows) {
        const list = ledgers.get(r.member_id) ?? []
        list.push({
          id: r.id,
          type: r.type as TransactionType,
          miles: r.miles,
          occurredAt: r.occurred_at,
          expiresAt: r.expires_at,
          expiredTransactionId: r.expired_transaction_id,
          reversedTransactionId: r.reversed_transaction_id,
        })
        ledgers.set(r.member_id, list)
      }

      for (const m of batch) {
        const ledger = ledgers.get(m.id) ?? []
        const expiries = draftExpiries(ledger, now)
        if (expiries.length > 0) {
          try {
            const { count } = await this.db.loyalty_transaction.createMany({
              data: expiries.map((e) => ({
                member_id: m.id,
                type: 'expire',
                miles: e.miles,
                expired_transaction_id: e.expiredTransactionId,
                occurred_at: now,
              })),
              skipDuplicates: true,
            })
            expiredRows += count
            if (count === expiries.length) expiredMiles += expiries.reduce((sum, e) => sum - e.miles, 0)
          } catch (error) {
            if (!isCheckViolation(error)) throw error
            failed += 1
            this.logger.warn(`Expiry for member ${m.id} would take the balance below 0; retrying on the next run`)
            continue
          }
        }

        const due = expiryReminders(ledger, now, settings.expiryReminderDays)
        if (due.length === 0) continue
        const { count } = await this.db.inbound_event.createMany({
          data: due.map((r) => ({
            source: EVENT_SOURCE,
            source_event_id: reminderEventId(m.id, r.expiresOn),
            event_type: 'miles_expiring',
            payload: {
              customer_id: m.customer_id,
              member_id: m.id,
              passenger_name: passengerName(m),
              miles: r.miles,
              expires_on: r.expiresOn,
            },
            received_at: now,
          })),
          skipDuplicates: true, // one reminder per member and date, ever
        })
        reminders += count
      }

      cursor = batch[batch.length - 1].id
      if (batch.length < JOB_BATCH) break
    }
    return { members, expiredRows, expiredMiles, reminders, failed }
  }
}
