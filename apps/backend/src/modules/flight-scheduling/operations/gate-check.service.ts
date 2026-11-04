import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { GateCheckInput } from '../dto/operations.dto'
import { UUID } from '../pagination'
import { AircraftFeasibilityService, type FeasibilityReport } from './aircraft-feasibility.service'

// A flight that is on the ground and not cancelled can still be moved.
const MOVABLE = ['scheduled', 'delayed']

// `outcome` is the report's own status; `status` is already the HTTP code of a result in `check`.
const summary = (report: FeasibilityReport) => ({
  feasible: report.status === 'feasible',
  outcome: report.status,
  violations: report.violations,
  pending: report.pending,
})

/**
 * Read-only runs of the gates (Iteration-03 "check feasibility"): for flights that are not saved yet, and for moving a saved flight to
 * another departure time. They take no lock, so the answer can be out of date by the time a confirm or reschedule runs; those run the
 * gates again under the aircraft lock.
 */
@Injectable()
export class GateCheckService {
  constructor(
    private readonly db: DbService,
    private readonly feasibility: AircraftFeasibilityService,
  ) {}

  /**
   * One result per proposed flight, in the order sent: the report of its gates, or the reason it could not be checked (an unknown route).
   * ponytail: the flights are checked against what is saved, not against each other, so two proposed flights of one aircraft that clash
   * with each other pass here; confirm catches it because it saves them in departure order.
   */
  async check(input: GateCheckInput) {
    const results: { index: number; flight_number: string; status: number; error?: unknown }[] = []
    for (const [index, f] of input.flights.entries()) {
      const base = { index, flight_number: f.flight_number }
      try {
        const route = await this.db.route.findUnique({
          where: { id: f.route_id },
          select: {
            is_active: true,
            origin: true,
            destination: true,
            distance_km: true,
            airport_route_originToairport: { select: { is_active: true } },
            airport_route_destinationToairport: { select: { is_active: true } },
          },
        })
        if (!route?.is_active) throw new UnprocessableEntityException('Route is unknown or not active')
        if (!route.airport_route_originToairport.is_active) throw new UnprocessableEntityException(`Airport ${route.origin} is not active`)
        if (!route.airport_route_destinationToairport.is_active)
          throw new UnprocessableEntityException(`Airport ${route.destination} is not active`)
        const report = await this.feasibility.checkAircraftFeasibility(
          f.aircraft_id,
          {
            flightId: null,
            flightNumber: f.flight_number,
            origin: route.origin,
            destination: route.destination,
            scheduledDepAt: f.dep_at,
            depAt: f.dep_at,
            arrAt: f.arr_at,
            distanceKm: route.distance_km,
          },
          this.db,
          { congestion: true },
        )
        results.push({ ...base, status: 200, ...summary(report) })
      } catch (e) {
        if (!(e instanceof HttpException)) throw e
        results.push({ ...base, status: e.getStatus(), error: e.getResponse() })
      }
    }
    return { results }
  }

  /** Can this saved flight leave at `depAt` instead? It keeps its length and its aircraft, and the same gates run as for a reschedule. */
  async availability(flightId: string, depAt: string | undefined) {
    if (!UUID.test(flightId)) throw new NotFoundException('Flight not found')
    if (depAt === undefined || Number.isNaN(Date.parse(depAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(depAt)) {
      throw new BadRequestException('dep_at must be an ISO 8601 date-time with an offset')
    }
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      select: {
        id: true,
        flight_number: true,
        status: true,
        aircraft_id: true,
        dep_at: true,
        arr_at: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true, distance_km: true } },
      },
    })
    if (!flight) throw new NotFoundException('Flight not found')
    if (!MOVABLE.includes(flight.status)) throw new ConflictException(`A ${flight.status} flight cannot be moved to another time`)

    const dep = new Date(depAt)
    const arr = new Date(dep.getTime() + (flight.arr_at.getTime() - flight.dep_at.getTime()))
    const report = await this.feasibility.checkAircraftFeasibility(
      flight.aircraft_id,
      {
        flightId: flight.id,
        flightNumber: flight.flight_number,
        origin: flight.route.origin,
        destination: flight.actual_destination ?? flight.route.destination,
        scheduledDepAt: dep,
        depAt: dep,
        arrAt: arr,
        distanceKm: flight.route.distance_km,
      },
      this.db,
      { congestion: true },
    )
    return { flight_id: flight.id, flight_number: flight.flight_number, dep_at: dep, arr_at: arr, ...summary(report) }
  }
}
