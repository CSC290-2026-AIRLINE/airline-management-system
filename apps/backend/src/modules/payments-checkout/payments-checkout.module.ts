import { Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { BookingChargeAdapter } from './booking-charge.adapter'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { ReceiptsController } from './receipts.controller'
import { CustomerPaymentsController, PaymentsController } from './payments.controller'
import { PaymentWebhookController } from './stripe-webhook.controller'
import { StaffPaymentsController } from './staff-payments.controller'
import { F5_SCREENS } from './guards/f5-screens'
import { ScreenAccessGuard } from './guards/screen-access.guard'
import { PAYMENT_REPOSITORY } from './payment.repository'
import { PrismaPaymentRepository } from './prisma-payment.repository'
import { FakePaymentGateway, PAYMENT_GATEWAY, type PaymentGateway } from './payment.gateway'
import { StripePaymentGateway } from './stripe.gateway'

/**
 * Feature 5a's module: the in-process payment flow the selling features call, and the REST surface the frontends
 * read.
 *
 * The two providers under a token are the seams. `PAYMENT_REPOSITORY` is Prisma-backed (the real payment tables);
 * `PAYMENT_GATEWAY` is the fake provider, or Stripe when `PAYMENT_PROVIDER=stripe`. Swapping
 * either is one line in the `providers` array — nothing else in the module changes.
 *
 * `AdminConsoleModule` is imported for two reasons: `AdminConsoleService.registerSelfScreens` registers 5a's staff
 * screens with the admin console's Role access matrix (the contract every feature team follows — see
 * `apps/staff-web/src/features/admin-console/contracts/README.md`), and `AuditModule` comes with it, which provides the
 * one shared `SimulationClock` and the audit writer.
 *
 * The same import is what lets `ScreenAccessGuard` ask the admin console whether the caller may open a screen: the
 * grant an admin makes on the Role access tab is the only thing that decides, and it is read from one place.
 */
/** How often the hold-end, capture-retry and reconcile jobs run. A real-clock timer: every step is safe to repeat. */
const MAINTENANCE_INTERVAL_MS = 30_000

@Module({
  imports: [AdminConsoleModule],
  controllers: [ReceiptsController, PaymentsController, CustomerPaymentsController, StaffPaymentsController, PaymentWebhookController],
  providers: [
    PaymentsCheckoutService,
    // Feature 3's checkout port: a paid seat or insurance charged inside its own transaction.
    BookingChargeAdapter,
    // The server half of the Role access matrix: it refuses a request whose caller was not granted the screen the
    // route needs, and records the refusal in the audit log.
    ScreenAccessGuard,
    // The fake provider, also exported so a demo or a test can force an outcome.
    FakePaymentGateway,
    // `PAYMENT_PROVIDER=stripe` (test-mode keys) selects Stripe; the default is the fake provider, which needs no account.
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService, FakePaymentGateway],
      useFactory: (config: ConfigService<EnvConfig, true>, fake: FakePaymentGateway): PaymentGateway =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'stripe'
          ? new StripePaymentGateway(config.get('STRIPE_SECRET_KEY', { infer: true }), config.get('STRIPE_WEBHOOK_SECRET', { infer: true }))
          : fake,
    },
    // The real tables. `InMemoryPaymentRepository` is the drop-in the unit tests use.
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
  ],
  exports: [PaymentsCheckoutService, FakePaymentGateway, BookingChargeAdapter],
})
export class PaymentsCheckoutModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsCheckoutModule.name)
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly admin: AdminConsoleService,
    private readonly payments: PaymentsCheckoutService,
  ) {}

  /**
   * Register 5a's staff screens so an admin can grant them to a role on the Role access tab. Without this the staff
   * pages have no screen code and `GET /api/me/screens` never returns them.
   *
   * `feature_no` is the unpadded number, as `screen.feature_no` stores it (`'6'`, `'13'`, `'3b'`), and the code
   * convention is `f<feature_no>.<snake_name>`.
   */
  async onModuleInit(): Promise<void> {
    await this.admin.registerSelfScreens(F5_SCREENS)
    this.timer = setInterval(() => void this.maintain(), MAINTENANCE_INTERVAL_MS)
    this.timer.unref()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private async maintain(): Promise<void> {
    try {
      const done = await this.payments.runMaintenancePass()
      if (done.expired + done.retried + done.reconciled > 0) this.logger.log(`Payment jobs: ${JSON.stringify(done)}`)
    } catch (error) {
      this.logger.error(`Payment jobs failed: ${String(error)}`)
    }
  }
}
