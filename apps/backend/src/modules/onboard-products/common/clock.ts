// F12's clock. Every F12 time comparison goes through it, and it reads
// the project's simulation clock (F15's SimulationClock, the one shared
// clock loyalty, check-in and crew rostering also read), so F12 moves
// with the rest of the system when that clock is shifted. The doc: "F12
// never calls the real system clock".
//
// SIMULATION_NOW_ISO is a dev and test override only: when it is set,
// F12 reads that fixed time instead. The project clock has no endpoint
// to move it yet, and testing the order cutoff needs a way to jump past
// it. Leave it empty everywhere else.

import { Injectable, Optional } from '@nestjs/common'
import { SimulationClock } from '../../admin-console/simulation-clock'

export interface ClockPort {
  now(): Date
}

@Injectable()
export class SystemClock implements ClockPort {
  constructor(@Optional() private readonly simulation?: SimulationClock) {}

  now(): Date {
    const override = process.env.SIMULATION_NOW_ISO
    if (override) {
      const parsed = new Date(override)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return this.simulation ? this.simulation.now() : new Date()
  }
}
