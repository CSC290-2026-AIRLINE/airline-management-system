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
import { InventoryService } from './inventory/inventory.service'
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
import { SeatChangeController } from './seats/seat-change.controller'
import { SeatChangeService } from './seats/seat-change.service'
import { CheckinSeatMapAdapter } from './providers/checkin-seat-map.adapter'
import { CheckinSeatProvider } from './providers/checkin-seat.provider'
import { FlightImpactService } from './flight-events/flight-impact.service'
import { AssistanceQueueService } from './assistance/assistance-queue.service'
import { StaffAssistanceController } from './assistance/staff-assistance.controller'
import { StaffAssistanceService } from './assistance/staff-assistance.service'
import { BookingAssistanceController } from './assistance/booking-assistance.controller'
import { BookingAssistanceService } from './assistance/booking-assistance.service'

@Module({
  // Feature 15's audit writer, for the staff cancellation entry (B7).
  imports: [AuditModule],
  controllers: [
    DevConfirmController,
    BookingsController,
    CustomerBookingsController,
    CancelController,
    HoldController,
    DemoPassengerController,
    StaffBookingController,
    DemoBookingCustomerController,
    SeatMapController,
    SeatChangeController,
    StaffAssistanceController,
    BookingAssistanceController,
  ],
  providers: [
    SeatMapService,
    SeatChangeService,
    CheckinSeatMapAdapter,
    CheckinSeatProvider,
    FlightImpactService,
    AssistanceQueueService,
    StaffAssistanceService,
    BookingAssistanceService,
    AssistanceService,
    SeatHoldExpiryService,
    HoldService,
    StaffBookingLookupService,
    DemoBookingCustomerService,
    DemoPassengerService,
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
    { provide: INVENTORY_PORT, useClass: InventoryService },
    { provide: SEAT_PORT, useClass: SeatService },
    { provide: SERVICE_REQUEST_PORT, useExisting: AssistanceService },
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
    FlightImpactService,
  ],
})
export class BookingPnrModule {}
