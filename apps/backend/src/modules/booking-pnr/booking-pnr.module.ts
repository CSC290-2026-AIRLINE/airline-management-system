import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { BookingProviderAdapter, BOOKING_PROVIDER } from './providers/booking-provider.adapter'
import { CancelController } from './cancel/cancel.controller'
import { CancelForFlightService } from './cancel/cancel-for-flight.service'
import { CancelService } from './cancel/cancel.service'
import { BookingStatusService } from './common/booking-status.service'
import { BookingErrorFilter } from './common/booking-error.filter'
import { LocalBookingEventBus } from './common/booking-event-bus'
import { SystemBookingClock } from './common/booking-clock'
import { ConfirmService } from './confirm/confirm.service'
import { DevConfirmController } from './confirm/dev-confirm.controller'
import { HoldExpiryJob } from './confirm/hold-expiry.job'
import { ReleaseService } from './confirm/release.service'
import { BookingReadService } from './manage/booking-read.service'
import { BookingsController } from './manage/bookings.controller'
import { CustomerBookingsController } from './manage/customer-bookings.controller'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  BOOKING_READ_PORT,
  CANCEL_FOR_FLIGHT_PORT,
  CHECKOUT_PORT,
  FLIGHT_EVENT_BUS,
  INVENTORY_PORT,
  LOYALTY_PORT,
  PRICING_PORT,
  REFUND_PORT,
  SCREENING_PORT,
  SEAT_MAP_PORT,
  SEAT_PORT,
  SERVICE_REQUEST_PORT,
} from './contracts'
import { CheckoutStub } from './stubs/checkout.stub'
import { LocalFlightEventBus } from './stubs/flight-event-bus.stub'
import { InventoryStub } from './stubs/inventory.stub'
import { LoyaltyStub } from './stubs/loyalty.stub'
import { PricingStub } from './stubs/pricing.stub'
import { RefundStub } from './stubs/refund.stub'
import { ScreeningStub } from './stubs/screening.stub'
import { SeatMapStub } from './stubs/seat-map.stub'
import { SeatStub } from './stubs/seat.stub'
import { ServiceRequestStub } from './stubs/service-request.stub'

@Module({
  // Feature 15's audit writer, for the staff cancellation entry (B7).
  imports: [AuditModule],
  controllers: [DevConfirmController, BookingsController, CustomerBookingsController, CancelController],
  providers: [
    BookingStatusService,
    ConfirmService,
    ReleaseService,
    CancelService,
    CancelForFlightService,
    HoldExpiryJob,
    BookingReadService,
    // Global, but it only catches BookingError, so other modules' errors are untouched.
    { provide: APP_FILTER, useClass: BookingErrorFilter },
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    { provide: BOOKING_EVENT_BUS, useClass: LocalBookingEventBus },
    { provide: INVENTORY_PORT, useClass: InventoryStub },
    { provide: SEAT_PORT, useClass: SeatStub },
    { provide: SERVICE_REQUEST_PORT, useClass: ServiceRequestStub },
    { provide: PRICING_PORT, useClass: PricingStub },
    { provide: LOYALTY_PORT, useClass: LoyaltyStub },
    { provide: CHECKOUT_PORT, useClass: CheckoutStub },
    { provide: REFUND_PORT, useClass: RefundStub },
    { provide: SCREENING_PORT, useClass: ScreeningStub },
    { provide: SEAT_MAP_PORT, useClass: SeatMapStub },
    { provide: BOOKING_READ_PORT, useExisting: BookingReadService },
    { provide: CANCEL_FOR_FLIGHT_PORT, useExisting: CancelForFlightService },
    { provide: FLIGHT_EVENT_BUS, useClass: LocalFlightEventBus },
    { provide: BOOKING_PROVIDER, useClass: BookingProviderAdapter },
  ],
  exports: [
    BookingStatusService,
    ConfirmService,
    ReleaseService,
    BOOKING_CLOCK,
    BOOKING_EVENT_BUS,
    INVENTORY_PORT,
    SEAT_PORT,
    SERVICE_REQUEST_PORT,
    PRICING_PORT,
    LOYALTY_PORT,
    CHECKOUT_PORT,
    REFUND_PORT,
    SCREENING_PORT,
    SEAT_MAP_PORT,
    BOOKING_READ_PORT,
    CANCEL_FOR_FLIGHT_PORT,
    FLIGHT_EVENT_BUS,
    BOOKING_PROVIDER,
  ],
})
export class BookingPnrModule {}
