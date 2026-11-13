import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '../../admin-console/admin-console.module'
import { AdminConsoleService } from '../../admin-console/admin-console.service'
import { AssignCrewModule } from '../assign-crew/assign-crew.module'
import { F08_SCREENS } from '../crew-rostering.screens'
import { FixPublishController } from './fix-publish.controller'
import { FixPublishService } from './fix-publish.service'

/**
 * Feature 8 · Step 4 — fix and publish.
 *
 * Owns closing `rule_break` rows, the swaps and sick calls that change who is on a
 * roster, and flipping a `roster_run` to published; it is the only step that writes
 * `audit_log`, through Feature 15's `AuditService` (from `AdminConsoleModule`). That import
 * also registers Feature 8's screens at startup. It imports `AssignCrewModule` for one reason: the rules live in
 * `AssignCrewService.check`, and a second copy here would let the two steps disagree
 * about whether a swap fixed anything. `DbModule` is `@Global()`, so no import is needed
 * for `DbService`.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  imports: [AssignCrewModule, AdminConsoleModule],
  controllers: [FixPublishController],
  providers: [FixPublishService],
  exports: [FixPublishService],
})
export class FixPublishModule implements OnModuleInit {
  constructor(private readonly adminConsole: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    // Idempotent upsert on `code`, so the crew screens appear in Role access without a manual insert.
    await this.adminConsole.registerSelfScreens(F08_SCREENS)
  }
}
