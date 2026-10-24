import { Module } from '@nestjs/common'
import { SetupRuleController } from './setup-rule.controller'
import { SetupRuleService } from './setup-rule.service'

/**
 * Feature 8 · Step 2 — legality rules.
 *
 * Reads the same tables the crew directory writes (`country_language`) but keeps its
 * own module and service: the wizard steps stay independently replaceable, and this
 * one never imports from another step's files. `DbModule` is `@Global()`, so
 * `DbService` arrives through the injector with no import here.
 *
 * Routes are authenticated by default via the global `JwtAuthGuard`; none is `@Public()`.
 */
@Module({
  controllers: [SetupRuleController],
  providers: [SetupRuleService],
  exports: [SetupRuleService],
})
export class SetupRuleModule {}
