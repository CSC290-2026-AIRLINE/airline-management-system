import { StaffBookingLookupService } from './staff/staff-booking-lookup.service'
import { DemoBookingCustomerController } from './staff/demo-booking-customer.controller'
import { DemoBookingCustomerService } from './staff/demo-booking-customer.service'
import { StaffBookingController } from './staff/staff-booking.controller'
import { DemoPassengerController } from './hold/demo-passenger.controller'
import { DemoPassengerService } from './hold/demo-passenger.service'
import { Module } from '@nestjs/common'
import { HoldController } from './hold/hold.controller'
import { HoldService } from './hold/hold.service'
import { APP_FILTER } from '@nestjs/core'
import { BookingProviderAdapter, BOOKING_PROVIDER } from './providers/booking-provider.adapter'
import { BookingStatusService } from './common/booking-status.service'
import { BookingErrorFilter } from './common/booking-error.filter'
import { SystemBookingClock } from './common/booking-clock'
import {
  BOOKING_CLOCK,
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
import { BookingReadStub } from './stubs/booking-read.stub'
import { CancelForFlightStub } from './stubs/cancel-for-flight.stub'
import { CheckoutStub } from './stubs/checkout.stub'
import { LocalFlightEventBus } from './stubs/flight-event-bus.stub'
import { InventoryService } from './inventory/inventory.service'
import { LoyaltyStub } from './stubs/loyalty.stub'
import { PricingStub } from './stubs/pricing.stub'
import { RefundStub } from './stubs/refund.stub'
import { ScreeningStub } from './stubs/screening.stub'
import { SeatMapStub } from './stubs/seat-map.stub'
import { SeatStub } from './stubs/seat.stub'
import { ServiceRequestStub } from './stubs/service-request.stub'

@Module({
  controllers: [HoldController, DemoPassengerController, StaffBookingController, DemoBookingCustomerController],
  providers: [
    HoldService,
    StaffBookingLookupService,
    DemoBookingCustomerService,
    DemoPassengerService,
    BookingStatusService,
    // Global, but it only catches BookingError, so other modules' errors are untouched.
    { provide: APP_FILTER, useClass: BookingErrorFilter },
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    { provide: INVENTORY_PORT, useClass: InventoryService },
    { provide: SEAT_PORT, useClass: SeatStub },
    { provide: SERVICE_REQUEST_PORT, useClass: ServiceRequestStub },
    { provide: PRICING_PORT, useClass: PricingStub },
    { provide: LOYALTY_PORT, useClass: LoyaltyStub },
    { provide: CHECKOUT_PORT, useClass: CheckoutStub },
    { provide: REFUND_PORT, useClass: RefundStub },
    { provide: SCREENING_PORT, useClass: ScreeningStub },
    { provide: SEAT_MAP_PORT, useClass: SeatMapStub },
    { provide: BOOKING_READ_PORT, useClass: BookingReadStub },
    { provide: CANCEL_FOR_FLIGHT_PORT, useClass: CancelForFlightStub },
    { provide: FLIGHT_EVENT_BUS, useClass: LocalFlightEventBus },
    { provide: BOOKING_PROVIDER, useClass: BookingProviderAdapter },
  ],
  exports: [
    BookingStatusService,
    BOOKING_CLOCK,
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
