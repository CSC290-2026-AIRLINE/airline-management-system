import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { filterStatement, statementLines, type StatementFilter } from './domain/ledger-view'
import { NO_TIER, tierForPassenger, type PassengerTier } from './domain/tier-lookup'
import type { MemberTier, TierCode } from './domain/types'
import type { BenefitUseDto, BookingStatus, MemberSummaryDto, RedemptionRowDto, StatementRowDto } from './dto/responses'
import { LoyaltyError, isUniqueViolation, notAMember } from './loyalty-error'
import { LoyaltyDataService, MEMBER_SELECT, type MemberRow } from './loyalty-data.service'

const route = (f: { flight_number: string; route: { origin: string; destination: string } }) =>
  `${f.route.origin} → ${f.route.destination} · ${f.flight_number}`
const cabinName = (cabin: string) =>
  cabin
    .split('_')
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ')

/**
 * The customer side of Feature 11: join, the dashboard summary, the statement, redemptions and benefits, plus
 * `tierForPassenger`, the in-process method features 6 and 12 call. Every timestamp comes from the simulation clock.
 */
@Injectable()
export class LoyaltyMemberService {
  private readonly logger = new Logger(LoyaltyMemberService.name)

  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly clock: SimulationClock,
  ) {}

  /** POST /loyalty/members. One member per customer; the member number comes from the database sequence. */
  async join(userId: string): Promise<MemberSummaryDto> {
    const customer = await this.customerFor(userId)
    try {
      const member = await this.db.loyalty_member.create({
        data: { customer_id: customer.id, joined_at: this.clock.now() },
        select: MEMBER_SELECT,
      })
      return this.data.summary(member, this.clock.now())
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LoyaltyError(HttpStatus.CONFLICT, 'ALREADY_A_MEMBER', 'You are already a Flython Miles member.')
      }
      throw error
    }
  }

  /** GET /loyalty/members/me. 404 NOT_A_MEMBER until the customer joins, which the Join page relies on. */
  async me(userId: string): Promise<MemberSummaryDto> {
    return this.data.summary(await this.memberFor(userId), this.clock.now())
  }

  /** GET /loyalty/members/me/transactions, newest first. */
  async statement(userId: string, filter: StatementFilter): Promise<StatementRowDto[]> {
    const member = await this.memberFor(userId)
    const [ledger, settings] = await Promise.all([this.data.ledger(member.id, member.customer.passenger_id), this.data.settings()])
    return filterStatement(statementLines(ledger, this.clock.now(), settings.expiryReminderDays), filter)
  }

  /** GET /loyalty/redemptions: redeem rows grouped per booking and flight, with the booking status from feature 3b. */
  async redemptions(userId: string): Promise<RedemptionRowDto[]> {
    const member = await this.memberFor(userId)
    const rows = await this.db.loyalty_transaction.findMany({
      where: { member_id: member.id, type: 'redeem' },
      orderBy: { seq: 'desc' },
      select: {
        id: true,
        miles: true,
        other_loyalty_transaction_loyalty_transaction_reversed_transaction_id_member_idToloyalty_transaction: { select: { id: true } },
        booking_coupon: {
          select: {
            booking_segment: {
              select: {
                cabin: true,
                booking: { select: { id: true, status: true, booking_reference: true } },
                seat_inventory: {
                  select: {
                    flight: {
                      select: {
                        id: true,
                        flight_number: true,
                        dep_at: true,
                        route: {
                          select: {
                            airport_route_originToairport: { select: { city: true } },
                            airport_route_destinationToairport: { select: { city: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    const groups = new Map<string, RedemptionRowDto>()
    for (const row of rows) {
      const segment = row.booking_coupon?.booking_segment
      if (!segment) continue
      const flight = segment.seat_inventory.flight
      const status = segment.booking.status as BookingStatus
      const returned = row.other_loyalty_transaction_loyalty_transaction_reversed_transaction_id_member_idToloyalty_transaction !== null
      const key = `${segment.booking.id}:${flight.id}`
      const group = groups.get(key)
      if (group) {
        group.seats += 1
        group.miles += -row.miles
        group.returned = group.returned && returned
        continue
      }
      groups.set(key, {
        transactionId: row.id,
        fromCity: flight.route.airport_route_originToairport.city,
        toCity: flight.route.airport_route_destinationToairport.city,
        flightNumber: flight.flight_number,
        departsAt: flight.dep_at.toISOString(),
        cabin: cabinName(segment.cabin),
        seats: 1,
        miles: -row.miles,
        bookingStatus: status,
        // A hold that lapsed before payment never became a trip, so there is nothing in My Trips to link to.
        bookingReference: status === 'expired' ? null : segment.booking.booking_reference,
        returned,
      })
    }
    return [...groups.values()]
  }

  /** GET /loyalty/members/me/benefits: lounge visits, upgrades and insurance policies, newest first. */
  async benefits(userId: string): Promise<BenefitUseDto[]> {
    const member = await this.memberFor(userId)
    const flightSelect = { select: { flight_number: true, route: { select: { origin: true, destination: true } } } }
    const [uses, policies] = await Promise.all([
      this.db.loyalty_benefit_use.findMany({
        where: { member_id: member.id },
        orderBy: { used_at: 'desc' },
        select: {
          id: true,
          benefit_type: true,
          from_cabin: true,
          to_cabin: true,
          guests: true,
          used_at: true,
          booking_coupon: { select: { booking_segment: { select: { seat_inventory: { select: { flight: flightSelect } } } } } },
        },
      }),
      this.db.loyalty_insurance_policy.findMany({
        where: { member_id: member.id },
        orderBy: { issued_at: 'desc' },
        select: {
          id: true,
          policy_number: true,
          price: true,
          currency: true,
          status: true,
          issued_at: true,
          booking: {
            select: {
              booking_segment: {
                orderBy: { segment_order: 'asc' },
                take: 1,
                select: { seat_inventory: { select: { flight: flightSelect } } },
              },
            },
          },
        },
      }),
    ])

    const items: BenefitUseDto[] = [
      ...uses.map((u) => ({
        id: u.id,
        kind: u.benefit_type === 'upgrade' ? ('upgrade' as const) : ('lounge_visit' as const),
        route: route(u.booking_coupon.booking_segment.seat_inventory.flight),
        usedAt: u.used_at.toISOString(),
        detail:
          u.benefit_type === 'upgrade'
            ? `${cabinName(u.from_cabin ?? '')} → ${cabinName(u.to_cabin ?? '')}`
            : u.guests === 0
              ? 'Member only'
              : `Member + ${u.guests} guest${u.guests === 1 ? '' : 's'}`,
      })),
      ...policies.map((p) => {
        const flight = p.booking.booking_segment[0]?.seat_inventory.flight
        const price = Number(p.price.toString())
        return {
          id: p.id,
          kind: 'insurance' as const,
          route: flight ? route(flight) : '',
          usedAt: p.issued_at.toISOString(),
          detail: `Policy ${p.policy_number} · ${price === 0 ? 'Included' : `${p.currency} ${price.toLocaleString('en-GB')}`}${p.status === 'cancelled' ? ' · Cancelled' : ''}`,
        }
      }),
    ]
    return items.sort((a, b) => b.usedAt.localeCompare(a.usedAt))
  }

  /**
   * The tier of the passenger who flies, for features 6 (baggage, priority) and 12 (onboard benefit). In-process only,
   * never an HTTP route. Never throws: any failure is "no tier", so a loyalty problem never blocks check-in.
   */
  async tierForPassenger(passengerId: string): Promise<PassengerTier> {
    try {
      const customer = await this.db.customer.findFirst({
        where: { passenger_id: passengerId, deleted_at: null },
        select: { id: true, loyalty_member: { select: { tier_code: true, tier_qualified_at: true, tier_expires_at: true } } },
      })
      const m = customer?.loyalty_member
      const member: MemberTier | null = m
        ? { tierCode: m.tier_code as TierCode | null, tierQualifiedAt: m.tier_qualified_at, tierExpiresAt: m.tier_expires_at }
        : null
      const [rules, benefits] = await Promise.all([this.data.tierRules(), this.data.tierBenefits()])
      return tierForPassenger(
        passengerId,
        { customerIdForPassenger: () => customer?.id ?? null, memberForCustomer: () => member },
        rules,
        benefits,
        this.clock.now(),
      )
    } catch (error) {
      this.logger.warn(`tierForPassenger failed, answering no tier: ${error instanceof Error ? error.message : String(error)}`)
      return NO_TIER
    }
  }

  private async customerFor(userId: string): Promise<{ id: string }> {
    const customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null } },
      select: { id: true },
    })
    if (!customer) throw new LoyaltyError(HttpStatus.FORBIDDEN, 'NOT_A_CUSTOMER', 'Only customer accounts can join Flython Miles.')
    return customer
  }

  private async memberFor(userId: string): Promise<MemberRow> {
    const member = await this.db.loyalty_member.findFirst({
      where: { customer: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null } } },
      select: MEMBER_SELECT,
    })
    if (!member) throw notAMember()
    return member
  }
}
