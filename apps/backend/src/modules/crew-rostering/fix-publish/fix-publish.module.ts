import { Module } from '@nestjs/common'
import { AssignCrewModule } from '../assign-crew/assign-crew.module'
import { FixPublishController } from './fix-publish.controller'
import { FixPublishService } from './fix-publish.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Owns closing `rule_break` rows, the swaps and sick calls that change who is on a
 * roster, and flipping a `roster_run` to published; it is the only step that writes
 * `audit_log`. It imports `AssignCrewModule` for one reason: the rules live in
 * `AssignCrewService.check`, and a second copy here would let the two steps disagree
 * about whether a swap fixed anything. `DbModule` is `@Global()`, so no import is needed
 * for `DbService`.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  imports: [AssignCrewModule],
  controllers: [FixPublishController],
  providers: [FixPublishService],
  exports: [FixPublishService],
})
export class FixPublishModule {}
