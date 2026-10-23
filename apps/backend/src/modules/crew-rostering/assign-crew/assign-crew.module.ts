import { Module } from '@nestjs/common'
import { AssignCrewController } from './assign-crew.controller'
import { AssignCrewService } from './assign-crew.service'

/**
 * Feature 8 · Step 3 — assign crew.
 *
 * Owns `pairing_leg_assignment` and the `rule_break` rows this step raises. It reads
 * the pairings Build pairings committed through `roster_run_pairing` rather than by
 * importing that step's service, so the two stay independently replaceable — the same
 * reason this module does not import `setup-crew` for the crew list. `DbModule` is
 * `@Global()`, so no import is needed for `DbService`.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  controllers: [AssignCrewController],
  providers: [AssignCrewService],
  exports: [AssignCrewService],
})
export class AssignCrewModule {}
