import { Injectable } from '@nestjs/common'

export interface LandedFlight {
  flight_id: string
  aircraft_id: string
  airport_code: string
  arrived_at: Date
}

/**
 * Where the landed flights come from. Feature 2 has no landing event: a job on the simulation
 * clock reads the flights whose arrival time has passed. Until Feature 2 offers them, the mock
 * below reports none, so the job starts no turnaround.
 *
 * TODO(F2-integration): Replace MockFlightLandingSource with a real implementation once Feature 2
 * exposes a query for flights whose scheduled arrival has passed relative to the simulation clock.
 * Steps:
 *  1. Create `RealFlightLandingSource extends FlightLandingSource` that queries the F2 flight
 *     table (e.g. `flight` where `actual_arrival <= SimulationClockService.now()`).
 *  2. Swap the provider binding in aircraft-management.module.ts:
 *       { provide: FlightLandingSource, useClass: RealFlightLandingSource }
 *  3. Remove MockFlightLandingSource (or keep it behind a feature flag for local dev).
 * Tracking: https://github.com/<org>/<repo>/issues/<F2-ticket>
 */
export abstract class FlightLandingSource {
  abstract listLanded(now: Date): Promise<LandedFlight[]>
}

/** @see FlightLandingSource for the TODO that removes this stub. */
@Injectable()
export class MockFlightLandingSource extends FlightLandingSource {
  listLanded(): Promise<LandedFlight[]> {
    return Promise.resolve([])
  }
}
