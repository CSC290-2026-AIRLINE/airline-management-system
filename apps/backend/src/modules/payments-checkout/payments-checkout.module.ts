import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { ReceiptsController } from './receipts.controller'
import { PaymentsController } from './payments.controller'
import { StaffPaymentsController } from './staff-payments.controller'
import { buildSeedPayments, InMemoryPaymentRepository, PAYMENT_REPOSITORY, seedRepository } from './payment.repository'
import { FakePaymentGateway, PAYMENT_GATEWAY } from './payment.gateway'

/**
 * Feature 5a's module: the in-process payment flow the selling features call, and the REST surface the frontends
 * read.
 *
 * The two providers under a token are the seams. `PAYMENT_REPOSITORY` is the mock's in-memory store today and a
 * Prisma-backed one tomorrow; `PAYMENT_GATEWAY` is the fake provider today and Stripe's tomorrow. Swapping either is
 * one line in the `providers` array — nothing else in the module changes.
 *
 * `AdminConsoleModule` is imported for two reasons: `AdminConsoleService.registerSelfScreens` registers 5a's staff
 * screens with the admin console's Role access matrix (the contract every feature team follows — see
 * `apps/staff-web/src/features/admin-console/contracts/README.md`), and `AuditModule` comes with it, which provides the
 * one shared `SimulationClock` and the audit writer.
 */
@Module({
  imports: [AdminConsoleModule],
  controllers: [ReceiptsController, PaymentsController, StaffPaymentsController],
  providers: [
    PaymentsCheckoutService,
    // The fake provider, also exported so a demo or a test can force an outcome.
    FakePaymentGateway,
    { provide: PAYMENT_GATEWAY, useExisting: FakePaymentGateway },
    {
      provide: PAYMENT_REPOSITORY,
      inject: [SimulationClock],
      useFactory: (clock: SimulationClock) => {
        const repo = new InMemoryPaymentRepository()
        seedRepository(repo, buildSeedPayments(), clock.now())
        return repo
      },
    },
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
