import { Module } from '@nestjs/common'
import { FixPublishController } from './fix-publish.controller'
import { FixPublishService } from './fix-publish.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Owns closing `rule_break` rows and flipping a `roster_run` to published, and is the
 * only Feature 8 step that writes `audit_log`. It reads the roster step 3 crewed
 * through `roster_run_pairing` and `pairing_leg_assignment` rather than by importing
 * that step's service, so the two stay independently replaceable. `DbModule` is
 * `@Global()`, so no import is needed for `DbService`.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  controllers: [FixPublishController],
  providers: [FixPublishService],
  exports: [FixPublishService],
})
export class FixPublishModule {}
