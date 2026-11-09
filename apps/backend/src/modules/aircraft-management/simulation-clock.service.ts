import { Injectable } from '@nestjs/common'

/**
 * The "current" status, a maintenance window in progress and the landing of a flight are all
 * decided against the shared simulation clock that Feature 1 owns, never the real clock. Feature 1
 * has no endpoint for it yet, so this answers with the real time. When the clock exists, only this
 * class changes.
 *
 * TODO(F1-integration): Replace the real-time fallback with a call to Feature 1's clock endpoint
 * once it is available.
 * Steps:
 *  1. Inject Feature 1's ClockService (or an HTTP client pointing at its /api/clock endpoint).
 *  2. `now()` should return the simulated Date from that service instead of `new Date()`.
 *  3. Adjust `today()` accordingly — make sure timezone handling (UTC vs. local origin airport)
 *     is verified with Feature 2 for weekday-based operating-day checks.
 * Tracking: https://github.com/<org>/<repo>/issues/<F1-ticket>
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
