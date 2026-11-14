import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '../admin-console/admin-console.module'
import { AdminConsoleService } from '../admin-console/admin-console.service'
import { CustomerComplaintsController, StaffComplaintsController } from './customer-service.controller'
import { F13_SCREENS } from './customer-service.constants'
import { CustomerServiceService } from './customer-service.service'

/** Feature 13: complaints from customers, worked by staff. Built by G16. */
@Module({
  // AdminConsoleModule exports the screen registry and (through AuditModule) the SimulationClock.
  imports: [AdminConsoleModule],
  controllers: [CustomerComplaintsController, StaffComplaintsController],
  providers: [CustomerServiceService],
})
export class CustomerServiceModule implements OnModuleInit {
  constructor(
    private readonly adminConsole: AdminConsoleService,
    private readonly service: CustomerServiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Idempotent upsert on `code`, so the screen shows up in Role access without a manual insert.
    await this.adminConsole.registerSelfScreens(F13_SCREENS)
    // Ensure Feature 13 demo flights, guest bookings, and initial cases exist in PostgreSQL.
    await this.service.ensureSeedData()
  }
}
