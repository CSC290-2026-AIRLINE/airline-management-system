import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { UUID } from '../pagination'
import { AIRCRAFT_DIRECTORY, type AircraftDirectory } from './aircraft-directory'
import { type AircraftLeg, checkAircraftFeasibility, type FeasibilityViolation, type TurnaroundResolver } from './aircraft-feasibility'
import type { Tx } from './flight-event-writer'

/** A flight to place on an aircraft: proposed (flightId null) or saved (its own row is left out of the comparison). */
export interface FeasibilityCandidate extends AircraftLeg {
  distanceKm: number
}

export type GateViolation =
  | FeasibilityViolation
  | { kind: 'aircraft_unavailable'; rule: string; detail: string }
  | { kind: 'range_exceeded'; distanceKm: number; maxRangeKm: number; detail: string }
  | { kind: 'congestion_exceeded'; airport: string; movement: 'departure' | 'arrival'; limit: number; movements: number; detail: string }

export interface FeasibilityReport {
  /** incomplete: nothing failed, but some gates could not run (see `pending`), so this is not a pass. */
  status: 'feasible' | 'not_feasible' | 'incomplete'
  violations: GateViolation[]
  pending: string[]
}

const NOT_CANCELLED = { not: 'cancelled' }
const HOUR_MS = 60 * 60 * 1000

/**
 * A flight is saved only when every gate passes (Iteration-03). A failed gate is 409 with the failing rules; a gate that
 * could not run because Feature 9 did not answer is 502, the spec's code for another feature being unreachable.
 */
export function assertGatesPass(report: FeasibilityReport, failedMessage: string): void {
  if (report.status === 'not_feasible') throw new ConflictException({ message: failedMessage, violations: report.violations })
  if (report.status === 'incomplete') {
    throw new BadGatewayException({
      message: 'Feature 9 could not answer every gate, so the flight was not saved',
      pending: report.pending,
    })
  }
}

@Injectable()
export class AircraftFeasibilityService {
  constructor(
    private readonly db: DbService,
    @Inject(AIRCRAFT_DIRECTORY) private readonly aircraft: AircraftDirectory,
  ) {}

  /**
   * The one feasibility gate for an aircraft on a flight: availability and range (Feature 9), then overlap, position and
   * turnaround against the aircraft's other flights. Read-only. Callers that save pass their transaction as `client`, after
   * taking the aircraft lock, so the check sees exactly what the write will commit against.
   */
  async checkAircraftFeasibility(
    aircraftId: string,
    candidate: FeasibilityCandidate,
    client: Tx = this.db,
    // Congestion only applies to a flight that is being placed in time (confirm, reschedule). Changing the aircraft adds no movement,
    // so it must not fail because a window was recorded over hours that are already full.
    options: { congestion?: boolean } = {},
  ): Promise<FeasibilityReport> {
    if (!UUID.test(aircraftId)) throw new BadRequestException('aircraft_id must be a UUID')
    if (!(candidate.arrAt > candidate.depAt)) throw new BadRequestException('arrival must be after departure')

    const violations: GateViolation[] = []
    const pending: string[] = []

    const availability = await this.aircraft.availability(aircraftId, candidate.depAt, candidate.arrAt)
    if (availability.kind === 'unavailable') {
      violations.push({ kind: 'aircraft_unavailable', rule: availability.rule, detail: availability.detail })
    } else if (availability.kind === 'unknown') {
      pending.push(`aircraft availability: ${availability.detail}`)
    }

    const facts = await this.aircraft.typeFacts(aircraftId)
    if (!facts) {
      pending.push('range: aircraft-type maximum range is not available from Feature 9')
      pending.push('turnaround: aircraft-type minimum is not available from Feature 9; checked against the airport minimum only')
    } else if (candidate.distanceKm > facts.maxRangeKm) {
      violations.push({
        kind: 'range_exceeded',
        distanceKm: candidate.distanceKm,
        maxRangeKm: facts.maxRangeKm,
        detail: `Route distance ${candidate.distanceKm} km exceeds the aircraft range of ${facts.maxRangeKm} km`,
      })
    }

    const others = await this.loadNeighbours(client, aircraftId, candidate)
    const required = await this.resolver(client, [candidate.origin, candidate.destination], facts?.minTurnaroundMinutes ?? null)

    violations.push(...checkAircraftFeasibility(candidate, others, required).violations)
    if (options.congestion) violations.push(...(await this.congestionViolations(client, candidate)))

    const status = violations.length ? 'not_feasible' : pending.length ? 'incomplete' : 'feasible'
    return { status, violations, pending }
  }

  /**
   * A congestion window (airport_congestion) limits the movements, departures plus arrivals, in each hour counted from the window's
   * start (the same buckets the congestion list uses). The candidate's departure is checked at its origin and its arrival at its
   * destination; the movements of other flights in that hour plus this one must not pass the limit.
   * ponytail: no lock per airport, so two confirms for different aircraft in one full hour can both pass; add an airport advisory lock
   * if that matters. A diverted flight still counts at its planned destination.
   */
  private async congestionViolations(client: Tx, candidate: FeasibilityCandidate): Promise<GateViolation[]> {
    const violations: GateViolation[] = []
    const moves = [
      { airport: candidate.origin, at: candidate.depAt, movement: 'departure' as const },
      { airport: candidate.destination, at: candidate.arrAt, movement: 'arrival' as const },
    ]
    for (const { airport, at, movement } of moves) {
      const window = await client.airport_congestion.findFirst({ where: { airport, starts_at: { lte: at }, ends_at: { gt: at } } })
      if (!window) continue
      const from = new Date(window.starts_at.getTime() + Math.floor((at.getTime() - window.starts_at.getTime()) / HOUR_MS) * HOUR_MS)
      const to = new Date(Math.min(from.getTime() + HOUR_MS, window.ends_at.getTime()))
      const others = await client.flight.count({
        where: {
          status: NOT_CANCELLED,
          ...(candidate.flightId && { id: { not: candidate.flightId } }),
          OR: [
            { route: { origin: airport }, dep_at: { gte: from, lt: to } },
            { route: { destination: airport }, arr_at: { gte: from, lt: to } },
          ],
        },
      })
      if (others + 1 > window.max_movement_per_hour) {
        violations.push({
          kind: 'congestion_exceeded',
          airport,
          movement,
          limit: window.max_movement_per_hour,
          movements: others + 1,
          detail: `${airport} allows ${window.max_movement_per_hour} movements per hour in that window; this ${movement} would be movement ${others + 1} of the hour starting ${from.toISOString()}`,
        })
      }
    }
    return violations
  }

  // The aircraft's nearest flight on each side by timetable order, plus anything overlapping the candidate's window.
  /**
   * The minimum turnaround rule for one aircraft at the given airports: the larger of the airport's and the aircraft type's
   * minimum (Iteration-03, decided). While Feature 9 cannot give the type minimum, only the airport minimum applies.
   */
  async turnaroundResolver(client: Tx, aircraftId: string, airports: string[]): Promise<TurnaroundResolver> {
    const facts = await this.aircraft.typeFacts(aircraftId)
    return this.resolver(client, airports, facts?.minTurnaroundMinutes ?? null)
  }

  private async resolver(client: Tx, airports: string[], typeMinimum: number | null): Promise<TurnaroundResolver> {
    const rows = await client.airport.findMany({
      where: { iata_code: { in: [...new Set(airports)] } },
      select: { iata_code: true, min_turnaround_min: true },
    })
    const airportMinimum = new Map(rows.map((a) => [a.iata_code, a.min_turnaround_min]))
    return (airport) => Math.max(airportMinimum.get(airport) ?? 0, typeMinimum ?? 0)
  }

  private async loadNeighbours(client: Tx, aircraftId: string, candidate: FeasibilityCandidate): Promise<AircraftLeg[]> {
    const base = {
      aircraft_id: aircraftId,
      status: NOT_CANCELLED,
      ...(candidate.flightId && { id: { not: candidate.flightId } }),
    }
    const select = {
      id: true,
      flight_number: true,
      scheduled_dep_at: true,
      dep_at: true,
      arr_at: true,
      actual_destination: true,
      route: { select: { origin: true, destination: true } },
    }

    const [previous, next, overlapping] = await Promise.all([
      client.flight.findMany({
        where: { ...base, scheduled_dep_at: { lt: candidate.scheduledDepAt } },
        orderBy: { scheduled_dep_at: 'desc' },
        take: 1,
        select,
      }),
      client.flight.findMany({
        where: { ...base, scheduled_dep_at: { gt: candidate.scheduledDepAt } },
        orderBy: { scheduled_dep_at: 'asc' },
        take: 1,
        select,
      }),
      client.flight.findMany({ where: { ...base, dep_at: { lt: candidate.arrAt }, arr_at: { gt: candidate.depAt } }, select }),
    ])

    const byId = new Map<string, AircraftLeg>()
    for (const f of [...previous, ...next, ...overlapping]) {
      byId.set(f.id, {
        flightId: f.id,
        flightNumber: f.flight_number,
        origin: f.route.origin,
        destination: f.actual_destination ?? f.route.destination,
        scheduledDepAt: f.scheduled_dep_at,
        depAt: f.dep_at,
        arrAt: f.arr_at,
      })
    }
    return [...byId.values()]
  }
}
