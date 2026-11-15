import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { PricingModule } from '@backend/modules/pricing/pricing.module'
import { PaymentsController } from './controllers/payments.controller'
import { CrewPayController } from './crew-pay/crew-pay.controller'
import { CrewPayService } from './crew-pay/crew-pay.service'
import { FakePayoutProvider } from './crew-pay/payout.provider'
import { StaffPaymentsController } from './controllers/staff-payments.controller'
import { FakeProviderController, WebhookController } from './controllers/webhook.controller'
import { PaymentsStaffGuard } from './guards/payments-staff.guard'
import { FakePaymentProvider } from './providers/fake.provider'
import { PAYMENT_PROVIDER, type PaymentProvider } from './providers/payment-provider'
import { StripePaymentProvider } from './providers/stripe.provider'
import { BookingSellerStub } from './sellers/booking.seller'
import { CargoSellerStub } from './sellers/cargo.seller'
import { BOOKING_SELLER, CARGO_SELLER } from './sellers/seller'
import { CheckoutService } from './services/checkout.service'
import { PaymentEngineService } from './services/payment-engine.service'
import { PaymentJobsService } from './services/payment-jobs.service'
import { RefundService } from './services/refund.service'
import {
  CallerService,
  FinancePostingService,
  PaymentMessagesService,
  PaymentSettingsService,
  ReceiptService,
} from './services/support.services'
import { VoucherService } from './services/voucher.service'
import { WebhookService } from './services/webhook.service'

/**
 * Feature 5: checkout and payment states (5a), refunds and compensation (5b), the finance journal, and crew pay (5c,
 * stretch). Other features call it in-process through the exported services:
 *   - 3b: RefundService.preview / refundCustomerCancel, PaymentEngineService.voidPayment
 *   - 17: RefundService.refundCargo
 *   - finance group / feature 4: FinancePostingService.read
 */
@Module({
  // AuditModule brings the shared SimulationClock and the audit writer; PricingModule the cancellation fee method.
  imports: [AuditModule, PricingModule],
  controllers: [PaymentsController, StaffPaymentsController, WebhookController, FakeProviderController, CrewPayController],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>): PaymentProvider =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'stripe'
          ? new StripePaymentProvider(
              config.get('STRIPE_SECRET_KEY', { infer: true }),
              config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
            )
          : new FakePaymentProvider(),
    },
    // Swap these two lines for Feature 3b's and Feature 17's services when they exist.
    { provide: BOOKING_SELLER, useClass: BookingSellerStub },
    { provide: CARGO_SELLER, useClass: CargoSellerStub },
    PaymentSettingsService,
    CallerService,
    FinancePostingService,
    PaymentMessagesService,
    ReceiptService,
    VoucherService,
    PaymentEngineService,
    CheckoutService,
    RefundService,
    WebhookService,
    PaymentJobsService,
    CrewPayService,
    FakePayoutProvider,
    PaymentsStaffGuard,
  ],
  exports: [PaymentEngineService, RefundService, FinancePostingService, VoucherService],
})
export class PaymentsModule {}
