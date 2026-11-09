import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { addHours } from './domain/dates'
import { CABIN_ORDER } from './domain/upgrade'
import type { AwardCabinDto, AwardFlightDto, AwardRouteDto, AwardSearchDto } from './dto/responses'
import { LoyaltyDataService } from './loyalty-data.service'

/** Award seats are sold only on flights still on the ground and on time or delayed. */
const OPEN_STATUSES = ['scheduled', 'delayed']

const INVENTORY_SELECT = {
  cabin: true,
  award_limit: true,
  award_held_count: true,
  award_sold_count: true,
  loyalty_award_release: { select: { miles_cost: true } },
} as const

interface InventoryRow {
  cabin: string
  award_limit: number
  award_held_count: number
  award_sold_count: number
  loyalty_award_release: { miles_cost: number } | null
}

/** Released cabins only, in cabin order, with the seats left from feature 3b's seat_inventory (the only seat count). */
export function awardCabins(rows: readonly InventoryRow[], seats: number, balance: number | null): AwardCabinDto[] {
  return rows
    .filter((r) => r.loyalty_award_release && r.award_limit > 0)
    .sort((a, b) => CABIN_ORDER.indexOf(a.cabin as never) - CABIN_ORDER.indexOf(b.cabin as never))
    .map((r) => {
      const milesCost = r.loyalty_award_release?.miles_cost ?? 0
      const seatsLeft = Math.max(0, r.award_limit - r.award_held_count - r.award_sold_count)
      const totalMiles = milesCost * seats
      return {
        cabin: r.cabin,
        milesCost,
        seatsLeft,
        totalMiles,
        enoughSeats: seatsLeft >= seats,
        balanceCovers: balance === null ? null : balance >= totalMiles,
      }
    })
}

/**
 * Award availability: what Flight search (feature 3a, and Feature 11's mobile Flight Search with miles) shows beside
 * the cash fare. Read-only: nothing is held or spent here; 3b holds the seats and calls redeem at booking.
 */
@Injectable()
export class LoyaltyAwardService {
  constructor(
    private readonly db: DbService,
    private readonly data: LoyaltyDataService,
    private readonly clock: SimulationClock,
  ) {}

  /**
   * In-process method for feature 3a: per flight, the released cabins with miles cost, award seats left and whether
   * the customer's balance covers `seats` passengers who take a seat. A flight inside the award cutoff, or not open,
   * has no cabins. `customerId` null = a guest or non-member (balanceCovers null).
   */
  async awardAvailability(flightIds: string[], seats: number, customerId: string | null): Promise<Map<string, AwardCabinDto[]>> {
    const now = this.clock.now()
    const [settings, balance, flights] = await Promise.all([
      this.data.settings(),
      customerId ? this.balanceOf({ customer_id: customerId }) : Promise.resolve(null),
      this.db.flight.findMany({
        where: { id: { in: flightIds }, status: { in: OPEN_STATUSES } },
        select: { id: true, dep_at: true, seat_inventory: { select: INVENTORY_SELECT } },
      }),
    ])
    const cutoff = addHours(now, settings.awardCutoffHours)
    return new Map(flights.map((f) => [f.id, f.dep_at > cutoff ? awardCabins(f.seat_inventory, seats, balance) : []]))
  }

  /** GET /loyalty/award-routes: routes with an open flight ahead, for the search form's From and To. */
  async routes(): Promise<AwardRouteDto[]> {
    const rows = await this.db.route.findMany({
      where: { is_active: true, flight: { some: { status: { in: OPEN_STATUSES }, dep_at: { gt: this.clock.now() } } } },
      orderBy: [{ origin: 'asc' }, { destination: 'asc' }],
      select: {
        origin: true,
        destination: true,
        airport_route_originToairport: { select: { city: true } },
        airport_route_destinationToairport: { select: { city: true } },
      },
    })
    return rows.map((r) => ({
      origin: r.origin,
      originCity: r.airport_route_originToairport.city,
      destination: r.destination,
      destinationCity: r.airport_route_destinationToairport.city,
    }))
  }

  /**
   * GET /loyalty/award-flights: every open flight on the route and service date, earliest first, each with its award
   * cabins (empty when nothing is released, or inside the cutoff). Signed-in customers; the balance is null for a
   * customer who has not joined, so the page can offer to join instead.
   */
  async search(userId: string, q: { origin: string; destination: string; date: string; seats: number }): Promise<AwardSearchDto> {
    const now = this.clock.now()
    const [settings, balance, flights] = await Promise.all([
      this.data.settings(),
      this.balanceOf({ customer: { user_id: userId, deleted_at: null } }),
      this.db.flight.findMany({
        where: {
          service_date: new Date(`${q.date}T00:00:00.000Z`),
          status: { in: OPEN_STATUSES },
          dep_at: { gt: now },
          route: { origin: q.origin.toUpperCase(), destination: q.destination.toUpperCase() },
        },
        orderBy: { dep_at: 'asc' },
        take: 50,
        select: {
          id: true,
          flight_number: true,
          dep_at: true,
          arr_at: true,
          route: {
            select: {
              origin: true,
              destination: true,
              airport_route_originToairport: { select: { city: true, timezone: true } },
              airport_route_destinationToairport: { select: { city: true, timezone: true } },
            },
          },
          seat_inventory: { select: INVENTORY_SELECT },
        },
      }),
    ])
    const cutoff = addHours(now, settings.awardCutoffHours)
    return {
      asOf: now.toISOString(),
      seats: q.seats,
      milesBalance: balance,
      awardCutoffHours: settings.awardCutoffHours,
      flights: flights.map((f): AwardFlightDto => {
        const closed = f.dep_at <= cutoff
        return {
          flightId: f.id,
          flightNumber: f.flight_number,
          origin: f.route.origin,
          originCity: f.route.airport_route_originToairport.city,
          destination: f.route.destination,
          destinationCity: f.route.airport_route_destinationToairport.city,
          originTimeZone: f.route.airport_route_originToairport.timezone,
          destinationTimeZone: f.route.airport_route_destinationToairport.timezone,
          departsAt: f.dep_at.toISOString(),
          arrivesAt: f.arr_at.toISOString(),
          durationMin: Math.round((f.arr_at.getTime() - f.dep_at.getTime()) / 60_000),
          cabins: closed ? [] : awardCabins(f.seat_inventory, q.seats, balance),
          closed,
        }
      }),
    }
  }

  private async balanceOf(where: { customer_id: string } | { customer: { user_id: string; deleted_at: null } }): Promise<number | null> {
    const member = await this.db.loyalty_member.findFirst({ where, select: { miles_balance: true } })
    return member?.miles_balance ?? null
  }
}
