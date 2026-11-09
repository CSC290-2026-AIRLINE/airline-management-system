import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { addMonths } from './domain/dates'
import { expiryReminders } from './domain/expiry'
import type { StatementSource } from './domain/ledger-view'
import { benefitsFromRow, parseSettings } from './domain/rules'
import { effectiveTier, progressToNextTier, tierStats } from './domain/tier'
import type { LoyaltySettings, TierBenefits, TierCode, TierRule, TransactionType } from './domain/types'
import type { MemberSummaryDto, TierInfoDto } from './dto/responses'

type Client = DbService | Prisma.TransactionClient

const num = (d: { toString(): string } | null) => (d === null ? null : Number(d.toString()))

const LEDGER_SELECT = {
  id: true,
  seq: true,
  type: true,
  miles: true,
  balance_after: true,
  occurred_at: true,
  expires_at: true,
  expired_transaction_id: true,
  reversed_transaction_id: true,
  distance_km: true,
  multiplier: true,
  reason: true,
  booking_coupon: {
    select: {
      passenger_id: true,
      booking_passenger: { select: { passenger: { select: { first_name: true, last_name: true } } } },
      booking_segment: {
        select: {
          cabin: true,
          fare_class: { select: { name: true } },
          seat_inventory: {
            select: { flight: { select: { flight_number: true, route: { select: { origin: true, destination: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.loyalty_transactionSelect

export const MEMBER_SELECT = {
  id: true,
  customer_id: true,
  member_number: true,
  miles_balance: true,
  tier_code: true,
  tier_qualified_at: true,
  tier_expires_at: true,
  joined_at: true,
  customer: {
    select: {
      passenger_id: true,
      passenger: { select: { first_name: true, last_name: true } },
      user: { select: { email: true } },
    },
  },
} satisfies Prisma.loyalty_memberSelect

export type MemberRow = Prisma.loyalty_memberGetPayload<{ select: typeof MEMBER_SELECT }>

export const memberName = (m: MemberRow) => `${m.customer.passenger.first_name} ${m.customer.passenger.last_name}`.trim()

/**
 * Reads shared by the customer and staff services: rules, benefits and settings (read at request time, never cached,
 * so a staff edit shows at once), and a member's ledger in the shape the Statement builder takes.
 */
@Injectable()
export class LoyaltyDataService {
  constructor(private readonly db: DbService) {}

  async settings(client: Client = this.db): Promise<LoyaltySettings> {
    return parseSettings(await client.loyalty_setting.findMany({ select: { key: true, value: true } }))
  }

  async tierRules(client: Client = this.db): Promise<TierRule[]> {
    const rows = await client.loyalty_tier_rule.findMany({ orderBy: { rank: 'asc' } })
    return rows.map((r) => ({
      code: r.code as TierCode,
      name: r.name,
      rank: r.rank,
      minMiles: r.min_miles,
      minFlights: r.min_flights,
      validMonths: r.valid_months,
    }))
  }

  async tierBenefits(client: Client = this.db): Promise<Map<string, TierBenefits>> {
    const rows = await client.loyalty_tier_benefit.findMany()
    return new Map(
      rows.map((r) => [
        r.tier_code,
        benefitsFromRow({
          lounge_guests: r.lounge_guests,
          extra_baggage_kg: num(r.extra_baggage_kg) ?? 0,
          priority_checkin: r.priority_checkin,
          priority_boarding: r.priority_boarding,
          upgrade_eligible: r.upgrade_eligible,
          insurance_price: num(r.insurance_price),
        }),
      ]),
    )
  }

  /** The tier table: every rule that has a benefits row, lowest rank first. */
  async tiers(): Promise<TierInfoDto[]> {
    const [rules, benefits] = await Promise.all([this.tierRules(), this.tierBenefits()])
    return rules.flatMap((r) => {
      const b = benefits.get(r.code)
      return b ? [{ ...r, benefits: b }] : []
    })
  }

  /** A member's ledger in `seq` order, with each coupon's flight read through feature 3's booking tables. */
  async ledger(memberId: string, ownPassengerId: string): Promise<StatementSource[]> {
    const rows = await this.db.loyalty_transaction.findMany({
      where: { member_id: memberId },
      orderBy: { seq: 'asc' },
      select: LEDGER_SELECT,
    })
    const occurredById = new Map(rows.map((r) => [r.id, r.occurred_at]))
    return rows.map((r) => {
      const c = r.booking_coupon
      const flight = c?.booking_segment.seat_inventory.flight
      const pax = c?.booking_passenger.passenger
      return {
        id: r.id,
        seq: Number(r.seq),
        type: r.type as TransactionType,
        miles: r.miles,
        balanceAfter: r.balance_after,
        occurredAt: r.occurred_at,
        expiresAt: r.expires_at,
        expiredTransactionId: r.expired_transaction_id,
        reversedTransactionId: r.reversed_transaction_id,
        distanceKm: r.distance_km,
        multiplier: r.multiplier === null ? null : r.multiplier.toFixed(2),
        reason: r.reason,
        coupon:
          c && flight && pax
            ? {
                origin: flight.route.origin,
                destination: flight.route.destination,
                flightNumber: flight.flight_number,
                cabin: c.booking_segment.cabin,
                fareClassName: c.booking_segment.fare_class?.name ?? null,
                passengerName: `${pax.first_name} ${pax.last_name}`.trim(),
                flownBySelf: c.passenger_id === ownPassengerId,
              }
            : null,
        expiredFrom: r.expired_transaction_id ? { occurredAt: occurredById.get(r.expired_transaction_id) ?? r.occurred_at } : null,
      }
    })
  }

  /** Dashboard summary: balance, the tier in force, progress on the rolling 12 months and miles expiring soon. */
  async summary(member: MemberRow, now: Date): Promise<MemberSummaryDto> {
    const [rules, settings, ledger] = await Promise.all([
      this.tierRules(),
      this.settings(),
      this.ledger(member.id, member.customer.passenger_id),
    ])
    const activity = ledger
      .filter((r) => r.type === 'earn')
      .map((r) => ({ miles: r.miles, occurredAt: r.occurredAt, flownBySelf: r.coupon?.flownBySelf ?? false }))
    const stats = tierStats(activity, now)
    const current = effectiveTier(
      { tierCode: member.tier_code as TierCode | null, tierQualifiedAt: member.tier_qualified_at, tierExpiresAt: member.tier_expires_at },
      now,
    )
    const currentRule = current ? rules.find((r) => r.code === current) : undefined
    const progress = progressToNextTier(stats, current, rules)

    return {
      memberNumber: member.member_number,
      name: memberName(member),
      email: member.customer.user.email,
      joinedAt: member.joined_at.toISOString(),
      asOf: now.toISOString(),
      milesBalance: member.miles_balance,
      tier:
        currentRule && member.tier_qualified_at && member.tier_expires_at
          ? {
              code: currentRule.code,
              name: currentRule.name,
              qualifiedAt: member.tier_qualified_at.toISOString(),
              expiresAt: member.tier_expires_at.toISOString(),
            }
          : null,
      tierMiles: stats.miles,
      tierFlights: stats.flights,
      nextTier: progress
        ? { code: progress.next.code, name: progress.next.name, minMiles: progress.next.minMiles, minFlights: progress.next.minFlights }
        : null,
      expiringSoon: expiryReminders(ledger, now, settings.expiryReminderDays),
    }
  }

  /** Expiry of a positive adjustment: it lasts as long as earned miles do. */
  creditExpiry(now: Date, settings: LoyaltySettings): Date {
    return addMonths(now, settings.milesRetentionMonths)
  }
}
