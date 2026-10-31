import { Injectable } from '@nestjs/common'

/**
 * Source of every business timestamp the admin-console module writes. `recorded_at` is never set by the service: the DB
 * default of `now()` is what keeps real time real, even if this offset is later rewound.
 *
 * State lives in process memory in this single injectable (a Nest provider is a singleton per container), and nowhere
 * else: there is no clock table (that would be a migration, i.e. a DB-Team change), and no env var (that would mean
 * editing `.env.example` + `src/config/env.validation.ts`, both platform-owned). When a simulation controller lands it
 * calls `shift()` on this provider, or replaces it with a ConfigService-backed one.
 */
@Injectable()
export class SimulationClock {
  private offsetMs = 0

  now(): Date {
    return new Date(Date.now() + this.offsetMs)
  }

  /** Move the simulated clock. Absorbing, so repeated shifts compose; never rewinds recorded_at. */
  shift(deltaMs: number): Date {
    this.offsetMs += deltaMs
    return this.now()
  }
}
