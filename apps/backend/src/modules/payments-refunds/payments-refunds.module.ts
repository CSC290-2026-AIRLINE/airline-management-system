import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { PaymentsRefundsService } from './payments-refunds.service'
import { RefundsController, VouchersController } from './refunds.controller'
import { StaffRefundsController } from './staff-refunds.controller'
import { ScreenAccessGuard } from './guards/screen-access.guard'
import { PrismaRefundRepository } from './prisma-refund.repository'
import { REFUND_REPOSITORY } from './refund-repository.interface'

/**
 * Feature 5b's module: refunds, vouchers and compensation, and the REST surface the frontends read.
 *
 * `REFUND_REPOSITORY` is the seam: the Prisma-backed repository reads and writes `refund`, `refund_line` and
 * `compensation_voucher`. The in-memory one the unit tests use is a drop-in for it.
 *
 * `AdminConsoleModule` is imported for two reasons: `AdminConsoleService.registerSelfScreens` registers 5b's staff
 * screens with the admin console's Role access matrix, and `AuditModule` comes with it, which provides the one shared
 * `SimulationClock` and the audit writer. The same import lets `ScreenAccessGuard` ask the admin console whether the
 * caller may open a screen.
 */
@Module({
  imports: [AdminConsoleModule],
  controllers: [RefundsController, VouchersController, StaffRefundsController],
  providers: [
    PaymentsRefundsService,
    ScreenAccessGuard,
    // The real tables. The in-memory repository is only for the unit tests.
    PrismaRefundRepository,
    { provide: REFUND_REPOSITORY, useExisting: PrismaRefundRepository },
  ],
  exports: [PaymentsRefundsService],
})
export class PaymentsRefundsModule implements OnModuleInit {
  constructor(private readonly admin: AdminConsoleService) {}

  /**
   * Register 5b's staff screens so an admin can grant them to a role on the Role access tab. Without this the staff
   * pages have no screen code and `GET /api/me/screens` never returns them.
   *
   * `feature_no` is the unpadded number, as `screen.feature_no` stores it, and the code convention is
   * `f<feature_no>.<snake_name>`.
   */
  async onModuleInit(): Promise<void> {
    await this.admin.registerSelfScreens([
      { code: 'f5.refund_queue', name: 'Refund queue', kind: 'assignable', feature_no: '5' },
      { code: 'f5.compensation_vouchers', name: 'Compensation & vouchers', kind: 'assignable', feature_no: '5' },
    ])
  }
}
