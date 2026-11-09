import { HttpStatus, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { addHours, utcDateKey } from './domain/dates'
import { LOUNGE_WINDOW_HOURS, loungeRefusal, normaliseDeskQuery } from './domain/lounge'
import { effectiveTier } from './domain/tier'
import type { TierCode } from './domain/types'
import type { LoungeMemberDto, LoungeResultDto, LoungeVisitDto } from './dto/responses'
import type { LoyaltyStaffPrincipal } from './guards/loyalty-staff.guard'
import { LoyaltyError, isUniqueViolation } from './loyalty-error'
import { LoyaltyDataService, MEMBER_SELECT, memberName, type MemberRow } from './loyalty-data.service'

const notFound = () => new LoyaltyError(HttpStatus.NOT_FOUND, 'LOUNGE_NOT_FOUND', 'No member or booking matches that number.')

/** A flight that has left, been cancelled or diverted no longer qualifies anyone for the lounge. */
const GONE_STATUSES = ['cancelled', 'departed', 'arrived', 'diverted']

interface Ticket {
  flightId: string
  couponId: string
  flightNumber: string
  label: string
}

/** Departure time at the origin airport, as the desk agent reads it off the departures board. */
function localTime(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at)
  } catch {
    return at.toISOString().slice(11, 16) // an unknown zone name: show UTC rather than fail the desk
  }
}

/**
 * Staff Lounge Desk: admits a member against their tier (Feature 11) and a confirmed ticket departing within 4 hours
 * (feature 3b), and records the visit in `loyalty_benefit_use`. Benefits follow the person who flies, so the ticket
 * must be the member's own passenger, never one they only booked.
 */
@Injectable()
export class LoyaltyLoungeService {
  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly clock: SimulationClock,
  ) {}

  /** POST /staff/loyalty/lounge-visits. 404 when nothing matches; every other outcome is an answer for the desk. */
  async admit(who: LoyaltyStaffPrincipal, query: string, guests: number): Promise<LoungeResultDto> {
    const now = this.clock.now()
    const found = await this.findMember(query)
    if (!found) throw notFound()
    const { member, bookingId } = found

    const [rules, benefits] = await Promise.all([this.data.tierRules(), this.data.tierBenefits()])
    const code = effectiveTier(
      { tierCode: member.tier_code as TierCode | null, tierQualifiedAt: member.tier_qualified_at, tierExpiresAt: member.tier_expires_at },
      now,
    )
    const rule = code ? rules.find((r) => r.code === code) : undefined
    const loungeGuests = rule ? (benefits.get(rule.code)?.loungeGuests ?? null) : null
    const ticket = await this.nextTicket(member.customer.passenger_id, now, bookingId)

    const desk: LoungeMemberDto = {
      name: memberName(member),
      memberNumber: member.member_number,
      tierName: rule?.name ?? null,
      guestsAllowed: loungeGuests,
      ticket: ticket?.label ?? null,
    }
    const alreadyVisited = ticket
      ? (await this.db.loyalty_benefit_use.count({
          where: { member_id: member.id, flight_id: ticket.flightId, benefit_type: 'lounge_visit' },
        })) > 0
      : false

    const refusal = loungeRefusal({ loungeGuests, hasTicket: ticket !== null, guests, alreadyVisited })
    if (refusal || !ticket) return { outcome: 'refused', reason: refusal ?? 'no_ticket', member: desk }

    try {
      await this.db.loyalty_benefit_use.create({
        data: {
          member_id: member.id,
          benefit_type: 'lounge_visit',
          booking_coupon_id: ticket.couponId,
          flight_id: ticket.flightId,
          guests,
          staff_id: who.staffId,
          used_at: now,
        },
        select: { id: true },
      })
    } catch (error) {
      // Two desks admitting the same member at once: the unique index lets one in.
      if (isUniqueViolation(error)) return { outcome: 'refused', reason: 'already_visited', member: desk }
      throw error
    }
    return { outcome: 'admitted', member: desk, flightNumber: ticket.flightNumber, guests }
  }

  /** GET /staff/loyalty/lounge-visits: today's visits on the simulation clock (UTC day), newest first, at most 50. */
  async visitsToday(): Promise<LoungeVisitDto[]> {
    const now = this.clock.now()
    const start = new Date(`${utcDateKey(now)}T00:00:00.000Z`)
    const [rows, rules] = await Promise.all([
      this.db.loyalty_benefit_use.findMany({
        where: { benefit_type: 'lounge_visit', used_at: { gte: start, lte: now } },
        orderBy: { used_at: 'desc' },
        take: 50,
        select: {
          id: true,
          guests: true,
          used_at: true,
          loyalty_member: { select: MEMBER_SELECT },
          booking_coupon: {
            select: { booking_segment: { select: { seat_inventory: { select: { flight: { select: { flight_number: true } } } } } } },
          },
        },
      }),
      this.data.tierRules(),
    ])
    return rows.map((r) => {
      const m = r.loyalty_member
      const code = effectiveTier(
        { tierCode: m.tier_code as TierCode | null, tierQualifiedAt: m.tier_qualified_at, tierExpiresAt: m.tier_expires_at },
        now,
      )
      return {
        id: r.id,
        time: r.used_at.toISOString().slice(11, 16),
        memberName: memberName(m),
        tierName: rules.find((t) => t.code === code)?.name ?? 'No tier',
        flightNumber: r.booking_coupon.booking_segment.seat_inventory.flight.flight_number,
        guests: r.guests,
      }
    })
  }

  /**
   * A member number finds that member. A booking reference finds the members flying on it: the booker when they are
   * on it, otherwise the first member among its passengers. The booking then limits the ticket search to that booking.
   */
  private async findMember(query: string): Promise<{ member: MemberRow; bookingId: string | null } | null> {
    const q = normaliseDeskQuery(query)
    if (q.kind === 'member') {
      const member = await this.db.loyalty_member.findFirst({
        where: { member_number: q.memberNumber, customer: { deleted_at: null } },
        select: MEMBER_SELECT,
      })
      return member ? { member, bookingId: null } : null
    }

    const booking = await this.db.booking.findUnique({
      where: { booking_reference: q.reference },
      select: { id: true, customer_id: true, booking_passenger: { select: { passenger_id: true } } },
    })
    if (!booking) return null
    const members = await this.db.loyalty_member.findMany({
      where: { customer: { deleted_at: null, passenger_id: { in: booking.booking_passenger.map((p) => p.passenger_id) } } },
      select: MEMBER_SELECT,
    })
    const member = members.find((m) => m.customer_id === booking.customer_id) ?? members[0]
    return member ? { member, bookingId: booking.id } : null
  }

  /** The member's own confirmed coupon that departs soonest within the window, on a flight still on the ground. */
  private async nextTicket(passengerId: string, now: Date, bookingId: string | null): Promise<Ticket | null> {
    const coupon = await this.db.booking_coupon.findFirst({
      where: {
        passenger_id: passengerId,
        status: 'confirmed',
        ...(bookingId ? { booking_id: bookingId } : {}),
        booking_segment: {
          booking: { status: 'confirmed' },
          seat_inventory: {
            flight: { dep_at: { gt: now, lte: addHours(now, LOUNGE_WINDOW_HOURS) }, status: { notIn: GONE_STATUSES } },
          },
        },
      },
      orderBy: { booking_segment: { seat_inventory: { flight: { dep_at: 'asc' } } } },
      select: {
        id: true,
        flight_id: true,
        check_in: { where: { status: { in: ['checked_in', 'boarded'] } }, select: { status: true }, take: 1 },
        booking_segment: {
          select: {
            seat_inventory: {
              select: {
                flight: {
                  select: {
                    flight_number: true,
                    dep_at: true,
                    route: { select: { origin: true, destination: true, airport_route_originToairport: { select: { timezone: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!coupon) return null
    const f = coupon.booking_segment.seat_inventory.flight
    const state = coupon.check_in.length > 0 ? 'checked in' : 'not checked in'
    return {
      flightId: coupon.flight_id,
      couponId: coupon.id,
      flightNumber: f.flight_number,
      label: `${f.flight_number} · ${f.route.origin} → ${f.route.destination} · departs ${localTime(f.dep_at, f.route.airport_route_originToairport.timezone)} · ${state}`,
    }
  }
}
