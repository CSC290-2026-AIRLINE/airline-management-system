import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { PaymentsRefundsService } from './payments-refunds.service'
import { RefundsController, VouchersController } from './refunds.controller'
import { StaffRefundsController } from './staff-refunds.controller'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'
import { PrismaRefundRepository } from './prisma-refund.repository'
import { REFUND_REPOSITORY } from './refund-repository.interface'
import { CARD_REFUND_PORT } from './card-refund.port'

/**
 * Feature 5b's module: refunds, vouchers and compensation, and the REST surface the frontends read.
 *
 * `REFUND_REPOSITORY` is the seam: the Prisma-backed repository reads and writes `refund`, `refund_line` and
 * `compensation_voucher`. The in-memory one the unit tests use is a drop-in for it.
 *
 * `CARD_REFUND_PORT` is the other seam: a refund to the card is paid by Feature 5a's provider, so the port is 5a's
 * `PaymentsCheckoutService` (which exports exactly what the port asks for). 5b registers itself with 5a to hear the
 * provider's late word, a webhook, on a refund that was still pending.
 *
 * `AdminConsoleModule` is imported for two reasons: `AdminConsoleService.registerSelfScreens` registers 5b's staff
 * screens with the admin console's Role access matrix, and `AuditModule` comes with it, which provides the one shared
 * `SimulationClock` and the audit writer. The same import lets `ScreenAccessGuard` ask the admin console whether the
 * caller may open a screen.
 */
@Module({
  imports: [AdminConsoleModule, PaymentsCheckoutModule],
  controllers: [RefundsController, VouchersController, StaffRefundsController],
  providers: [
    PaymentsRefundsService,
    ScreenAccessGuard,
    // The real tables. The in-memory repository is only for the unit tests.
    PrismaRefundRepository,
    { provide: REFUND_REPOSITORY, useExisting: PrismaRefundRepository },
    // Money back to the card goes through 5a's provider.
    { provide: CARD_REFUND_PORT, useExisting: PaymentsCheckoutService },
  ],
  exports: [PaymentsRefundsService],
})
export class PaymentsRefundsModule implements OnModuleInit {
  constructor(
    private readonly admin: AdminConsoleService,
    private readonly checkout: PaymentsCheckoutService,
    private readonly refunds: PaymentsRefundsService,
  ) {}

  /**
   * Register 5b's staff screens so an admin can grant them to a role on the Role access tab. Without this the staff
   * pages have no screen code and `GET /api/me/screens` never returns them.
   *
   * `feature_no` is the unpadded number, as `screen.feature_no` stores it, and the code convention is
   * `f<feature_no>.<snake_name>`.
   *
   * It also tells 5a where to hand a refund the provider settles later (Stripe's `refund.*` webhooks).
   */
  async onModuleInit(): Promise<void> {
    this.checkout.registerRefundSettler((settlement) => this.refunds.settleFromProvider(settlement))
    await this.admin.registerSelfScreens([
      { code: 'f5.refund_queue', name: 'Refund queue', kind: 'assignable', feature_no: '5' },
      { code: 'f5.compensation_vouchers', name: 'Compensation & vouchers', kind: 'assignable', feature_no: '5' },
    ])
  }
}
