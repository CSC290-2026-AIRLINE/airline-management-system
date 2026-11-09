import { Injectable } from '@nestjs/common'

export interface LandedFlight {
  flight_id: string
  aircraft_id: string
  airport_code: string
  arrived_at: Date
}

/**
 * Where the landed flights come from. Feature 2 has no landing event: a job on the simulation clock reads the flights whose
 * arrival time has passed. Until Feature 2 offers them, the mock below reports none, so the job starts no turnaround.
 */
export abstract class FlightLandingSource {
  abstract listLanded(now: Date): Promise<LandedFlight[]>
}

@Injectable()
export class MockFlightLandingSource extends FlightLandingSource {
  listLanded(): Promise<LandedFlight[]> {
    return Promise.resolve([])
  }
}
