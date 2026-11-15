import { Module, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { ReceiptsController } from './receipts.controller'
import { PaymentsController } from './payments.controller'
import { PaymentWebhookController } from './stripe-webhook.controller'
import { StaffPaymentsController } from './staff-payments.controller'
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
@Module({
  imports: [AdminConsoleModule],
  controllers: [ReceiptsController, PaymentsController, StaffPaymentsController, PaymentWebhookController],
  providers: [
    PaymentsCheckoutService,
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
  exports: [PaymentsCheckoutService, FakePaymentGateway],
})
export class PaymentsCheckoutModule implements OnModuleInit {
  constructor(private readonly admin: AdminConsoleService) {}

  /**
   * Register 5a's staff screens so an admin can grant them to a role on the Role access tab. Without this the staff
   * pages have no screen code and `GET /api/me/screens` never returns them.
   *
   * `feature_no` is the unpadded number, as `screen.feature_no` stores it (`'6'`, `'13'`, `'3b'`), and the code
   * convention is `f<feature_no>.<snake_name>`.
   */
  async onModuleInit(): Promise<void> {
    await this.admin.registerSelfScreens([
      { code: 'f5.payment_lookup', name: 'Payment lookup', kind: 'assignable', feature_no: '5' },
      { code: 'f5.payment_exceptions', name: 'Payment exceptions', kind: 'assignable', feature_no: '5' },
    ])
  }
}
