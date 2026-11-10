import { Module } from '@nestjs/common'
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
import { InventoryStub } from './stubs/inventory.stub'
import { LoyaltyStub } from './stubs/loyalty.stub'
import { PricingStub } from './stubs/pricing.stub'
import { RefundStub } from './stubs/refund.stub'
import { ScreeningStub } from './stubs/screening.stub'
import { SeatMapStub } from './stubs/seat-map.stub'
import { SeatService } from './seats/seat.service'
import { AssistanceService } from './assistance/assistance.service'
import { SeatMapController } from './seats/seat-map.controller'
import { SeatMapService } from './seats/seat-map.service'
import { SeatHoldExpiryService } from './seats/seat-hold-expiry.service'

@Module({
  controllers: [SeatMapController],
  providers: [
    SeatMapService,
    SeatHoldExpiryService,
    BookingStatusService,
    // Global, but it only catches BookingError, so other modules' errors are untouched.
    { provide: APP_FILTER, useClass: BookingErrorFilter },
    { provide: BOOKING_CLOCK, useClass: SystemBookingClock },
    { provide: INVENTORY_PORT, useClass: InventoryStub },
    { provide: SEAT_PORT, useClass: SeatService },
    { provide: SERVICE_REQUEST_PORT, useClass: AssistanceService },
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
