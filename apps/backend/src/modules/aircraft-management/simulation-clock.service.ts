import { Injectable } from '@nestjs/common'

/**
 * The "current" status, a maintenance window in progress and the landing of a flight are all decided against the shared
 * simulation clock that Feature 1 owns, never the real clock. Feature 1 has no endpoint for it yet, so this answers with
 * the real time. When the clock exists, only this class changes.
 */
@Injectable()
export class SimulationClockService {
  now(): Date {
    return new Date()
  }

  /** The simulated calendar date as `yyyy-mm-dd`. */
  today(): string {
    return this.now().toISOString().slice(0, 10)
  }
}
