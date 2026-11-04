import { Module } from '@nestjs/common'
import { SimulationClock } from '../simulation-clock'
import { AuditService } from './audit.service'

/**
 * The audit writer, on its own so any feature can import it without pulling in the admin console's controllers:
 *
 *   @Module({ imports: [AuditModule], ... })
 *
 * It also owns the single `SimulationClock`. The clock keeps its offset in memory, so there must be exactly one
 * instance — `AdminConsoleModule` imports this module rather than providing a second clock of its own.
 * `DbModule` is `@Global()`, so it is not imported here.
 */
@Module({
  providers: [AuditService, SimulationClock],
  exports: [AuditService, SimulationClock],
})
export class AuditModule {}
