import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { addHours, utcDateKey } from './domain/dates'
import { UPGRADE_WINDOW_HOURS, nextCabin, upgradeQueues, type Cabin, type UpgradeCandidate } from './domain/upgrade'
import { LoyaltyDataService } from './loyalty-data.service'
import { isUniqueViolation } from './loyalty-error'
import { LOYALTY_SEAT_PORT, type LoyaltySeatPort } from './loyalty-seat.port'

/** inbound_event.source for Feature 11 (feature 13 routes 'cabin_upgraded' to the member). */
const EVENT_SOURCE = '11'

interface CandidateRow {
  coupon_id: string
  flight_id: string
  from_cabin: string
  confirmed_at: Date
  member_id: string
  customer_id: string
  tier_code: string
  flight_number: string
  service_date: Date
  first_name: string
  last_name: string
}

const cabinName = (cabin: string) =>
  cabin
    .split('_')
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ')

/**
 * The complimentary upgrade job (F11 doc, Tier benefits). For flights departing in the next 24 hours on the simulation
 * clock, it takes members' own coupons that are confirmed, paid in cash, not checked in and not upgraded before, and
 * moves each one cabin up while the higher cabin has a free cash seat: higher tier first, then the booking confirmed
 * earliest. Each move, its `loyalty_benefit_use` row and the `cabin_upgraded` message commit together. No fare
 * difference is charged or refunded, and a repeat changes nothing (one upgrade per coupon, unique index).
 */
@Injectable()
export class LoyaltyUpgradeService {
  private readonly logger = new Logger(LoyaltyUpgradeService.name)

  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    @Inject(LOYALTY_SEAT_PORT) private readonly seats: LoyaltySeatPort,
  ) {}

  async run(now: Date): Promise<Record<string, number>> {
    const [rules, benefits] = await Promise.all([this.data.tierRules(), this.data.tierBenefits()])
    const eligible = new Map(rules.filter((r) => benefits.get(r.code)?.upgradeEligible).map((r) => [r.code as string, r]))
    if (eligible.size === 0) return { candidates: 0, upgraded: 0, noSeat: 0, skipped: 0 }

    const rows = (await this.candidates(now)).filter((r) => eligible.has(r.tier_code))
    const byCoupon = new Map(rows.map((r) => [r.coupon_id, r]))
    const candidates: UpgradeCandidate[] = rows.map((r) => ({
      couponId: r.coupon_id,
      flightId: r.flight_id,
      fromCabin: r.from_cabin,
      tierRank: eligible.get(r.tier_code)?.rank ?? 0,
      confirmedAt: r.confirmed_at,
    }))

    const flightIds = [...new Set(candidates.map((c) => c.flightId))]
    const inventory = flightIds.length
      ? await this.db.seat_inventory.findMany({ where: { flight_id: { in: flightIds } }, select: { flight_id: true, cabin: true } })
      : []
    const cabinsOf = new Map<string, string[]>()
    for (const s of inventory) cabinsOf.set(s.flight_id, [...(cabinsOf.get(s.flight_id) ?? []), s.cabin])

    let upgraded = 0
    let noSeat = 0
    let skipped = 0
    for (const queue of upgradeQueues(candidates).values()) {
      const toCabin = nextCabin(queue[0].fromCabin, cabinsOf.get(queue[0].flightId) ?? [])
      if (!toCabin) {
        skipped += queue.length // already in the flight's best cabin
        continue
      }
      for (let i = 0; i < queue.length; i += 1) {
        const row = byCoupon.get(queue[i].couponId)
        if (!row) continue
        const outcome = await this.upgradeOne(row, toCabin, eligible.get(row.tier_code)?.name ?? '', now)
        if (outcome === 'upgraded') upgraded += 1
        else if (outcome === 'no_seat') {
          noSeat += queue.length - i // the cabin is full: nobody further down this queue can move
          break
        } else skipped += 1
      }
    }
    return { candidates: candidates.length, upgraded, noSeat, skipped }
  }

  private async upgradeOne(row: CandidateRow, toCabin: Cabin, tierName: string, now: Date) {
    try {
      return await this.db.$transaction(async (tx) => {
        const outcome = await this.seats.upgradeCoupon(tx, row.coupon_id, toCabin, now)
        if (outcome !== 'upgraded') return outcome
        await tx.loyalty_benefit_use.create({
          data: {
            member_id: row.member_id,
            benefit_type: 'upgrade',
            booking_coupon_id: row.coupon_id,
            flight_id: row.flight_id,
            from_cabin: row.from_cabin,
            to_cabin: toCabin,
            used_at: now,
          },
          select: { id: true },
        })
        await tx.inbound_event.createMany({
          data: [
            {
              source: EVENT_SOURCE,
              source_event_id: `cabin_upgraded:${row.coupon_id}`,
              event_type: 'cabin_upgraded',
              payload: {
                customer_id: row.customer_id,
                member_id: row.member_id,
                passenger_name: `${row.first_name} ${row.last_name}`.trim(),
                tier_name: tierName,
                flight_number: row.flight_number,
                service_date: utcDateKey(row.service_date),
                to_cabin: cabinName(toCabin),
              },
              received_at: now,
            },
          ],
          skipDuplicates: true,
        })
        return outcome
      })
    } catch (error) {
      // A concurrent run upgraded this coupon first; the transaction rolled the seat move back.
      if (isUniqueViolation(error)) return 'not_upgradable' as const
      this.logger.error(`Upgrade of coupon ${row.coupon_id} failed: ${error instanceof Error ? error.message : String(error)}`)
      return 'not_upgradable' as const
    }
  }

  /**
   * Coupons that may be upgraded: the passenger is a member's own (customer.passenger_id), the booking is confirmed and
   * paid in cash, the passenger takes a seat, has not started check-in and was never upgraded on this coupon, and the
   * flight is still scheduled or delayed and departs within the window. The tier is filtered in code (still valid,
   * eligible in loyalty_tier_benefit).
   */
  private candidates(now: Date): Promise<CandidateRow[]> {
    const until = addHours(now, UPGRADE_WINDOW_HOURS)
    return this.db.$queryRaw<CandidateRow[]>`
      SELECT c.id AS coupon_id, c.flight_id, s.cabin AS from_cabin, b.confirmed_at, m.id AS member_id, m.customer_id,
             m.tier_code, f.flight_number, f.service_date, p.first_name, p.last_name
        FROM booking_coupon c
        JOIN booking_segment s    ON s.id = c.booking_segment_id
        JOIN booking b            ON b.id = c.booking_id
        JOIN booking_passenger bp ON bp.id = c.booking_passenger_id
        JOIN flight f             ON f.id = c.flight_id
        JOIN passenger p          ON p.id = c.passenger_id
        JOIN customer cu          ON cu.passenger_id = c.passenger_id AND cu.deleted_at IS NULL
        JOIN loyalty_member m     ON m.customer_id = cu.id
       WHERE c.status = 'confirmed'
         AND b.status = 'confirmed'
         AND b.payment_type = 'cash'
         AND b.confirmed_at IS NOT NULL
         AND bp.lap_of_id IS NULL
         AND f.status IN ('scheduled', 'delayed')
         AND f.dep_at > ${now}
         AND f.dep_at <= ${until}
         AND m.tier_code IS NOT NULL
         AND m.tier_qualified_at <= ${now}
         AND m.tier_expires_at > ${now}
         AND NOT EXISTS (SELECT 1 FROM check_in ci
                          WHERE ci.booking_passenger_id = c.booking_passenger_id AND ci.flight_id = c.flight_id AND ci.status <> 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM loyalty_benefit_use u WHERE u.booking_coupon_id = c.id AND u.benefit_type = 'upgrade')
       ORDER BY c.id`
  }
}
