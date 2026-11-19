import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '../admin-console/admin-console.module'
import { AdminConsoleService } from '../admin-console/admin-console.service'
import { AuditModule } from '../admin-console/audit/audit.module'
import { FlightSchedulingModule } from '../flight-scheduling/flight-scheduling.module'
import {
  CustomerComplaintsController,
  CustomerNotificationPreferencesController,
  StaffComplaintsController,
} from './customer-service.controller'
import { F13_SCREENS } from './customer-service.constants'
import { CustomerServiceService } from './customer-service.service'
import { CustomerServiceStaffGuard } from './guards/customer-service-staff.guard'
import { NotificationService } from './notification.service'

/** Feature 13: complaints from customers, worked by staff. Built by G16. */
@Module({
  imports: [AdminConsoleModule, AuditModule, FlightSchedulingModule],
  controllers: [
    CustomerComplaintsController,
    CustomerNotificationPreferencesController,
    StaffComplaintsController,
  ],
  providers: [CustomerServiceService, NotificationService, CustomerServiceStaffGuard],
  exports: [CustomerServiceService, NotificationService],
})
export class CustomerServiceModule implements OnModuleInit {
  constructor(private readonly adminConsole: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    // Idempotent upsert on `code`, so the screen shows up in Role access without a manual insert.
    await this.adminConsole.registerSelfScreens(F13_SCREENS)
  }
}
