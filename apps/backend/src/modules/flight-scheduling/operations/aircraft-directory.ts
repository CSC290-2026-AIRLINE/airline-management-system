import { Injectable } from '@nestjs/common'

// What Feature 2 needs from Feature 9 (Aircraft). Iteration-03: availability and aircraft-type values come from Feature 9's
// API, never from its tables. The API does not exist yet, so the default provider answers "unknown" instead of guessing;
// swap it for a real adapter once Feature 9 publishes its routes.

export const AIRCRAFT_DIRECTORY = Symbol('AIRCRAFT_DIRECTORY')

export type AircraftAvailability =
  | { kind: 'available' }
  /** `rule` is Feature 9's own failing rule (e.g. grounded, in maintenance), shown to staff as is. */
  | { kind: 'unavailable'; rule: string; detail: string }
  | { kind: 'unknown'; detail: string }

/** Aircraft-type values Feature 2 gates on. */
export interface AircraftTypeFacts {
  maxRangeKm: number
  minTurnaroundMinutes: number
}

export interface AircraftDirectory {
  /** false while Feature 9's API is not connected: no aircraft can pass the gates, so nothing that needs them is offered. */
  readonly connected: boolean
  /** Is the aircraft in service for the whole window [from, to)? */
  availability(aircraftId: string, from: Date, to: Date): Promise<AircraftAvailability>
  /** null when Feature 9 cannot tell us yet. */
  typeFacts(aircraftId: string): Promise<AircraftTypeFacts | null>
}

export const F9_NOT_CONNECTED = 'Feature 9 aircraft API is not connected yet'

@Injectable()
export class PendingAircraftDirectory implements AircraftDirectory {
  readonly connected = false

  availability(): Promise<AircraftAvailability> {
    return Promise.resolve({ kind: 'unknown', detail: F9_NOT_CONNECTED })
  }

  typeFacts(): Promise<AircraftTypeFacts | null> {
    return Promise.resolve(null)
  }
}
