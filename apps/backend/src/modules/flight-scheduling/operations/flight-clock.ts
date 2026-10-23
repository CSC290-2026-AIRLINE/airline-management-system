import { Injectable } from '@nestjs/common'

// Business time for Feature 2 (occurred_at, detected_at, resolved_at, "has the flight started"). Iteration-03: this must be
// Feature 1's simulation clock, never the machine clock. Feature 1 has not published one yet, so callers depend on this
// port and the module binds an interim adapter; swap the binding, not the callers, once Feature 1 ships its clock.

export const FLIGHT_CLOCK = Symbol('FLIGHT_CLOCK')

export interface FlightClock {
  now(): Date
}

/** INTERIM until Feature 1's simulation clock exists: reads the machine clock. Do not use outside the FLIGHT_CLOCK binding. */
@Injectable()
export class InterimMachineClock implements FlightClock {
  now(): Date {
    return new Date()
  }
}
