import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import { FLOWN_CHECK_IN_STATUSES } from './found-bag-lifecycle.service'
import { AIRPORT_CODE_PATTERN, UUID_PATTERN } from './common/patterns'

/** A flight as the baggage desk names it: "FY 204 · BKK to HKT · 20 Oct". Read only; Feature 2 owns flights. */
export interface BaggageFlight {
  id: string
  flightNumber: string
  serviceDate: Date
  origin: string
  /** Where the flight landed: the diversion airport when it was diverted, otherwise the route's destination. */
  destination: string
  arrivedAt: Date
  departsAt: Date
}

/** An airport bags can be found at or sent to. Read only; Feature 2 owns airports. */
export interface BaggageAirport {
  code: string
  name: string
  city: string
}

/** How far back a found bag can still be matched to the flight it came off. */
export const ARRIVAL_WINDOW_DAYS = 3

/** How far ahead staff can book a found bag onto a flight. */
export const DEPARTURE_WINDOW_DAYS = 3

const DAY_MS = 86_400_000

const SELECT = {
  id: true,
  flight_number: true,
  service_date: true,
  arr_at: true,
  dep_at: true,
  actual_destination: true,
  route: { select: { origin: true, destination: true } },
} as const

interface FlightRow {
  id: string
  flight_number: string
  service_date: Date
  arr_at: Date
  dep_at: Date
  actual_destination: string | null
  route: { origin: string; destination: string }
}

function toFlight(row: FlightRow): BaggageFlight {
  return {
    id: row.id,
    flightNumber: row.flight_number,
    serviceDate: row.service_date,
    origin: row.route.origin,
    destination: row.actual_destination ?? row.route.destination,
    arrivedAt: row.arr_at,
    departsAt: row.dep_at,
  }
}

function toAirportCode(value: string | undefined, name: string): string {
  const code = value?.trim().toUpperCase()
  if (!code || !AIRPORT_CODE_PATTERN.test(code)) {
    throw new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_FOUND_BAG, `${name} must be a 3-letter IATA code`)
  }
  return code
}

function flightNotFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.FLIGHT_NOT_FOUND, 'Flight not found')
}

/** Flights for the "Came off flight" picker and the bag detail, so staff never type a flight id. */
@Injectable()
export class BaggageFlightService {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  /**
   * Flights that landed at the airport in the last few days, or are due within a day, newest first. A diverted flight
   * counts at the airport it was diverted to, not at its planned destination.
   */
  async arrivalsAt(airportCode: string): Promise<BaggageFlight[]> {
    const airport = toAirportCode(airportCode, 'Airport')

    const now = this.clock.now().getTime()
    const rows = await this.db.flight.findMany({
      where: {
        arr_at: { gte: new Date(now - ARRIVAL_WINDOW_DAYS * DAY_MS), lte: new Date(now + DAY_MS) },
        status: { not: 'cancelled' },
        OR: [{ actual_destination: airport }, { actual_destination: null, route: { destination: airport } }],
      },
      select: SELECT,
      orderBy: { arr_at: 'desc' },
      take: 50,
    })

    return rows.map(toFlight)
  }

  /**
   * Flights leaving the airport from a day ago to a few days ahead, soonest first, for "On flight" when a bag is sent.
   * With `to`, only flights landing there (a diverted flight counts where it landed).
   */
  async departuresFrom(from: string, to?: string): Promise<BaggageFlight[]> {
    const origin = toAirportCode(from, 'From airport')
    const destination = to?.trim() ? toAirportCode(to, 'To airport') : null

    const now = this.clock.now().getTime()
    const rows = await this.db.flight.findMany({
      where: {
        dep_at: { gte: new Date(now - DAY_MS), lte: new Date(now + DEPARTURE_WINDOW_DAYS * DAY_MS) },
        status: { not: 'cancelled' },
        route: { origin },
        ...(destination ? { OR: [{ actual_destination: destination }, { actual_destination: null, route: { origin, destination } }] } : {}),
      },
      select: SELECT,
      orderBy: { dep_at: 'asc' },
      take: 50,
    })

    return rows.map(toFlight)
  }

  /**
   * Diverted flights that landed in the last few days and still have bags to add, newest first. A flight counts once
   * Feature 2 sets its status to diverted and names the airport it landed at, and drops off once every tagged bag in its
   * hold has a found bag (the same bags `recordDiversion` would add).
   */
  async divertedRecently(): Promise<BaggageFlight[]> {
    const now = this.clock.now().getTime()
    const rows = await this.db.flight.findMany({
      where: {
        status: 'diverted',
        actual_destination: { not: null },
        arr_at: { gte: new Date(now - ARRIVAL_WINDOW_DAYS * DAY_MS), lte: new Date(now + DAY_MS) },
        check_in: {
          some: {
            status: { in: FLOWN_CHECK_IN_STATUSES },
            checked_bag: {
              some: {
                status: 'tagged',
                deleted_at: null,
                tag_number: { not: null },
                found_bag: { none: { status: { not: 'continued_with_flight' } } },
              },
            },
          },
        },
      },
      select: SELECT,
      orderBy: { arr_at: 'desc' },
      take: 50,
    })

    return rows.map(toFlight)
  }

  /** Active airports, by code. found_airport and bag_location_event.airport_code are foreign keys to this table. */
  async airports(): Promise<BaggageAirport[]> {
    const rows = await this.db.airport.findMany({
      where: { is_active: true },
      select: { iata_code: true, name: true, city: true },
      orderBy: { iata_code: 'asc' },
    })

    return rows.map((row) => ({ code: row.iata_code, name: row.name, city: row.city }))
  }

  async get(id: string): Promise<BaggageFlight> {
    if (!UUID_PATTERN.test(id)) throw flightNotFound()

    const row = await this.db.flight.findUnique({ where: { id }, select: SELECT })
    if (!row) throw flightNotFound()

    return toFlight(row)
  }
}
