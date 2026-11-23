import { Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import { PaymentsRefundsService } from './payments-refunds.service'
import { CustomerRefundsController, RefundRequestsController, RefundsController, VouchersController } from './refunds.controller'
import { StaffRefundsController } from './staff-refunds.controller'
import { F5_SCREENS } from '@backend/modules/payments-checkout/guards/f5-screens'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'
import { PrismaRefundRepository } from './prisma-refund.repository'
import { BookingRefundAdapter } from './booking-refund.adapter'
import { CargoRefundAdapter } from './cargo-refund.adapter'
import { OnboardPaymentsAdapter } from './onboard-payments.adapter'
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
/** How often 5b looks for cancelled flights it has not refunded. A real-clock timer: the work is idempotent. */
const FLIGHT_CANCEL_POLL_MS = 30_000

@Module({
  imports: [AdminConsoleModule, PaymentsCheckoutModule],
  controllers: [RefundsController, VouchersController, RefundRequestsController, CustomerRefundsController, StaffRefundsController],
  providers: [
    PaymentsRefundsService,
    ScreenAccessGuard,
    // The real tables. The in-memory repository is only for the unit tests.
    PrismaRefundRepository,
    { provide: REFUND_REPOSITORY, useExisting: PrismaRefundRepository },
    // Money back to the card goes through 5a's provider.
    { provide: CARD_REFUND_PORT, useExisting: PaymentsCheckoutService },
    // Feature 3's refund port: a cancelled booking comes here.
    BookingRefundAdapter,
    // Feature 17's refund method: a cancelled or rejected cargo booking comes here.
    CargoRefundAdapter,
    // Feature 12's payments port: an onboard order or sale is paid, and refunded, here.
    OnboardPaymentsAdapter,
  ],
  exports: [PaymentsRefundsService, BookingRefundAdapter, CargoRefundAdapter, OnboardPaymentsAdapter],
})
export class PaymentsRefundsModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsRefundsModule.name)
  private poll: ReturnType<typeof setInterval> | undefined

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
    await this.admin.registerSelfScreens(F5_SCREENS)
    /* Catch up on any cancelled flight (resolution `refund`) that has no receipt, in `seq` order, then keep looking. */
    void this.sweepFlightCancellations()
    this.poll = setInterval(() => void this.sweepFlightCancellations(), FLIGHT_CANCEL_POLL_MS)
    this.poll.unref()
  }

  onApplicationShutdown(): void {
    if (this.poll) clearInterval(this.poll)
  }

  private async sweepFlightCancellations(): Promise<void> {
    try {
      const refunds = await this.refunds.catchUpFlightCancellations()
      if (refunds > 0) this.logger.log(`Refunded ${refunds} payment(s) for cancelled flights`)
      const expired = await this.refunds.expireVouchers()
      if (expired > 0) this.logger.log(`Expired ${expired} voucher(s)`)
      const settled = await this.refunds.reconcileProcessingRefunds()
      if (settled > 0) this.logger.log(`Settled ${settled} refund(s) from the provider's own record`)
    } catch (error) {
      this.logger.error(`Flight cancellation sweep failed: ${String(error)}`)
    }
  }
}
