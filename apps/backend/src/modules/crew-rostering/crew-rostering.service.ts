import { Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { ScheduleQuery } from './dto/schedule-query.dto'
import { POOL_REACH_HOPS, SERVICE_DATE_LOOKAHEAD_DAYS, UNPAIRABLE_FLIGHT_STATUSES } from './crew-rostering.constants'
import type { AirportSummary, PairingCandidateFlight } from './crew-rostering.types'

/** Building `Intl.DateTimeFormat` is expensive, and a roster runs over few zones. */
const localDateFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Read-only half of Feature 8: it serves what Flight Scheduling (Feature 2)
 * already owns so the roster wizard has a schedule to build from.
 *
 * Pairings themselves are not persisted — the `pairing` and `pairing_leg`
 * tables are still a Database Team proposal, and this module does not create
 * them. Everything below is therefore a projection of existing tables, and the
 * page still builds and validates pairings in the browser.
 */
@Injectable()
export class CrewRosteringService {
  constructor(private readonly db: DbService) {}

  /** Airports an operator can pick as a pairing base. */
  async listBases(): Promise<AirportSummary[]> {
    const airports = await this.db.airport.findMany({
      where: { is_active: true },
      select: { iata_code: true, name: true, timezone: true },
      orderBy: { iata_code: 'asc' },
    })

    return airports.map((airport) => ({ iataCode: airport.iata_code, name: airport.name, timezone: airport.timezone }))
  }

  /**
   * Flights a pairing built at `base` could be made of: everything scheduled
   * out of the base's reachable airports inside the window, minus the flights
   * that cannot be crewed.
   *
   * Times are the *scheduled* ones. A roster describes what should happen, not
   * what did, so `dep_at`/`arr_at` — which the schema also requires — are left
   * alone here.
   */
  async findPairingPool(query: ScheduleQuery): Promise<PairingCandidateFlight[]> {
    const base = await this.db.airport.findUnique({ where: { iata_code: query.base }, select: { iata_code: true, timezone: true } })
    if (!base) {
      throw new NotFoundException(`Unknown base airport ${query.base}`)
    }

    const reachable = await this.reachableAirports(query.base)
    // One extra day of `service_date` keeps an overnight leg that departs just
    // after local midnight; the precise window is applied below, in the base's
    // own timezone.
    const windowEnd = addDays(query.dateTo, SERVICE_DATE_LOOKAHEAD_DAYS)

    const flights = await this.db.flight.findMany({
      where: {
        service_date: { gte: toUtcMidnight(query.dateFrom), lte: toUtcMidnight(windowEnd) },
        status: { notIn: [...UNPAIRABLE_FLIGHT_STATUSES] },
        route: { is_active: true, OR: [{ origin: { in: reachable } }, { destination: { in: reachable } }] },
      },
      select: {
        id: true,
        flight_number: true,
        scheduled_dep_at: true,
        scheduled_arr_at: true,
        route: { select: { origin: true, destination: true } },
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })

    const localDate = localDateFormatter(base.timezone)
    return flights
      .filter((flight) => {
        const departureDay = localDate.format(flight.scheduled_dep_at)
        return departureDay >= query.dateFrom && departureDay <= query.dateTo
      })
      .map((flight) => ({
        id: flight.id,
        flightNumber: flight.flight_number,
        origin: flight.route.origin,
        destination: flight.route.destination,
        departureAt: flight.scheduled_dep_at.toISOString(),
        arrivalAt: flight.scheduled_arr_at.toISOString(),
        status: 'available' as const,
      }))
  }

  /**
   * Airport codes within `POOL_REACH_HOPS` of the base, the base included. One
   * query per hop — never a query per airport.
   */
  private async reachableAirports(base: string): Promise<string[]> {
    const reached = new Set<string>([base])
    let frontier = [base]

    for (let hop = 0; hop < POOL_REACH_HOPS && frontier.length > 0; hop += 1) {
      const routes = await this.db.route.findMany({
        where: { is_active: true, OR: [{ origin: { in: frontier } }, { destination: { in: frontier } }] },
        select: { origin: true, destination: true },
      })

      frontier = []
      for (const route of routes) {
        for (const code of [route.origin, route.destination]) {
          if (!reached.has(code)) {
            reached.add(code)
            frontier.push(code)
          }
        }
      }
    }

    return [...reached]
  }
}

function toUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

function addDays(date: string, days: number): string {
  const next = toUtcMidnight(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

function localDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = localDateFormatters.get(timeZone)
  if (cached) {
    return cached
  }
  // `en-CA` formats as `YYYY-MM-DD`, which sorts and compares as a date does.
  const formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
  localDateFormatters.set(timeZone, formatter)
  return formatter
}
