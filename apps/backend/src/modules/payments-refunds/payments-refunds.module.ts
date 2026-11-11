import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsRefundsService } from './payments-refunds.service'
import { RefundsController, VouchersController } from './refunds.controller'
import { StaffRefundsController } from './staff-refunds.controller'
import { ScreenAccessGuard } from './guards/screen-access.guard'
import { buildSeedRefunds, buildSeedVouchers, InMemoryRefundRepository, REFUND_REPOSITORY, seedRepository } from './refund.repository'

/**
 * Feature 5b's module: refunds, vouchers and compensation, and the REST surface the frontends read.
 *
 * `REFUND_REPOSITORY` is the seam: the mock's in-memory store today and a Prisma-backed one tomorrow. Swapping it is
 * one line in the `providers` array — nothing else in the module changes.
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
    {
      provide: REFUND_REPOSITORY,
      inject: [SimulationClock],
      useFactory: async (clock: SimulationClock) => {
        const repo = new InMemoryRefundRepository()
        const now = clock.now()
        await seedRepository(repo, buildSeedRefunds(now), buildSeedVouchers(now))
        return repo
      },
    },
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
