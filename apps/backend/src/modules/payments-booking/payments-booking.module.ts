import { Module } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { BookingPnrModule } from '@backend/modules/booking-pnr/booking-pnr.module'
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { BookingCheckoutService } from './booking-checkout.service'
import { CargoSellerService } from './cargo-seller.service'
import { OnboardSellerService } from './onboard-seller.service'
import { PaymentEventsModule } from '@backend/modules/onboard-products/payment-events/payment-events.module'
import { CheckoutController, StaffCheckoutController } from './checkout.controller'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'

/**
 * Feature 5a's side of a flight booking's checkout. It is its own module so the dependency runs one way: it imports
 * Feature 3's `BookingPnrModule` (which exports `ConfirmService` and `ReleaseService`) and 5a, and neither of them imports
 * it. Feature 3 reaches Feature 5 the other way round, through its own `REFUND_PORT`.
 */
@Module({
  imports: [AdminConsoleModule, BookingPnrModule, PaymentsCheckoutModule, PaymentEventsModule],
  controllers: [CheckoutController, StaffCheckoutController],
  providers: [BookingCheckoutService, CargoSellerService, OnboardSellerService, ScreenAccessGuard],
})
export class PaymentsBookingModule {}
