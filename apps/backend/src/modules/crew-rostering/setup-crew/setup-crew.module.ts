import { Module } from '@nestjs/common'
import { SetupCrewController } from './setup-crew.controller'
import { SetupCrewService } from './setup-crew.service'

/**
 * Feature 8 · Step 1 — crew directory.
 *
 * Standalone by design: each step of the wizard owns its own tables and its own
 * controller, so nothing here imports from `setup-rule`, `build-pairing`,
 * `assign-crew` or `fix-publish`. `DbModule` is `@Global()`, which is why no import
 * for it is needed — `DbService` arrives through the injector.
 *
 * Routes are authenticated by default: `JwtAuthGuard` is registered as an `APP_GUARD`
 * in `AuthModule`, and no handler here is marked `@Public()`.
 */
@Module({
  controllers: [SetupCrewController],
  providers: [SetupCrewService],
  exports: [SetupCrewService],
})
export class SetupCrewModule {}
