// One central clock so the rest of the F12 module is testable. In dev
// it can be overridden by SIMULATION_NOW_ISO to a fixed timestamp; in
// tests the same env var is set by the test harness to make every
// time-dependent assertion deterministic.

import { Injectable } from '@nestjs/common'

export interface ClockPort {
  now(): Date
}

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    const override = process.env.SIMULATION_NOW_ISO
    if (override) {
      const parsed = new Date(override)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  }
}
