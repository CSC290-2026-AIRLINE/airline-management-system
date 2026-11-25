import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

/** How far back a landed flight still waits for its turnaround; older ones are left to staff. */
export const LANDED_LOOKBACK_MS = 24 * 60 * 60 * 1000

export interface LandedFlight {
  flight_id: string
  flight_number: string
  aircraft_id: string
  tail_number: string
  airport_code: string
  arrived_at: string
}

/**
 * The flights that have landed and have no turnaround yet. Feature 2 publishes no landing event, so a flight counts as
 * landed once its arrival time has passed on the simulation clock. Its `flight` table is only read here, never written.
 */
@Injectable()
export class LandedFlightsService {
  constructor(private readonly db: DbService) {}

  async listWaiting(now: Date): Promise<LandedFlight[]> {
    const rows = await this.db.flight.findMany({
      where: {
        arr_at: { gte: new Date(now.getTime() - LANDED_LOOKBACK_MS), lte: now },
        status: { not: 'cancelled' },
        aircraft: { deleted_at: null },
        // A soft-deleted turnaround does not count, so the flight can be started again.
        OR: [{ aircraft_turnaround: { is: null } }, { aircraft_turnaround: { deleted_at: { not: null } } }],
      },
      orderBy: { arr_at: 'desc' },
      select: {
        id: true,
        flight_number: true,
        aircraft_id: true,
        arr_at: true,
        actual_destination: true,
        aircraft: { select: { tail_number: true } },
        route: { select: { destination: true } },
      },
    })

    return rows.map((row) => ({
      flight_id: row.id,
      flight_number: row.flight_number,
      aircraft_id: row.aircraft_id,
      tail_number: row.aircraft.tail_number,
      // A diverted flight lands at its new destination, not the planned one.
      airport_code: row.actual_destination ?? row.route.destination,
      arrived_at: row.arr_at.toISOString(),
    }))
  }
}
