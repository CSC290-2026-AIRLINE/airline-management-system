import { StaffBookingLookupService } from './staff/staff-booking-lookup.service'
import { StaffBookingController } from './staff/staff-booking.controller'
import { Module } from '@nestjs/common'
import { HoldController } from './hold/hold.controller'
import { HoldService } from './hold/hold.service'
import { APP_FILTER } from '@nestjs/core'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { PricingModule } from '@backend/modules/pricing/pricing.module'
import { BookingProviderAdapter, BOOKING_PROVIDER } from './providers/booking-provider.adapter'
import { PricingAdapter } from './providers/pricing.adapter'
import { CancelController } from './cancel/cancel.controller'
import { CancelForFlightService } from './cancel/cancel-for-flight.service'
import { CancelService } from './cancel/cancel.service'
import { BookingStatusService } from './common/booking-status.service'
import { BookingErrorFilter } from './common/booking-error.filter'
import { LocalBookingEventBus } from './common/booking-event-bus'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { ConfirmService } from './confirm/confirm.service'
import { DevConfirmController } from './confirm/dev-confirm.controller'
import { HoldExpiryJob } from './confirm/hold-expiry.job'
import { ReleaseService } from './confirm/release.service'
import { BookingReadService } from './manage/booking-read.service'
import { BookingContactService } from './manage/booking-contact.service'
import { BookingsController } from './manage/bookings.controller'
import { CustomerBookingsController } from './manage/customer-bookings.controller'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  BOOKING_READ_PORT,
  CANCEL_FOR_FLIGHT_PORT,
  CHECKOUT_PORT,
  FLIGHT_EVENT_SOURCE,
  INVENTORY_PORT,
  LOYALTY_PORT,
  PRICING_PORT,
  REFUND_PORT,
  SCREENING_PORT,
  SEAT_MAP_PORT,
  INSURANCE_PORT,
  SEAT_PORT,
  SERVICE_REQUEST_PORT,
} from './contracts'
import { PaymentsCheckoutModule } from '@backend/modules/payments-checkout/payments-checkout.module'
import { BookingChargeAdapter } from '@backend/modules/payments-checkout/booking-charge.adapter'
import { SchedulingFlightEventSource } from './providers/scheduling-flight-events.adapter'
import { FlightSchedulingModule } from '@backend/modules/flight-scheduling/flight-scheduling.module'
import { InventoryService } from './inventory/inventory.service'
import { LoyaltyStub } from './stubs/loyalty.stub'
import { PaymentsRefundsModule } from '@backend/modules/payments-refunds/payments-refunds.module'
import { BookingRefundAdapter } from '@backend/modules/payments-refunds/booking-refund.adapter'
import { ScreeningStub } from './stubs/screening.stub'
import { AircraftSeatMapAdapter } from './providers/aircraft-seat-map.adapter'
import { SeatService } from './seats/seat.service'
import { AssistanceService } from './assistance/assistance.service'
import { SeatMapController } from './seats/seat-map.controller'
import { SeatMapService } from './seats/seat-map.service'
import { SeatHoldExpiryService } from './seats/seat-hold-expiry.service'
import { SeatChangeController } from './seats/seat-change.controller'
import { SeatChangeService } from './seats/seat-change.service'
import { HeldSeatChangeService } from './seats/held-seat-change.service'
import { CheckinSeatMapAdapter } from './providers/checkin-seat-map.adapter'
import { CheckinSeatProvider } from './providers/checkin-seat.provider'
import { FlightImpactService } from './flight-events/flight-impact.service'
import { AssistanceQueueService } from './assistance/assistance-queue.service'
import { StaffAssistanceController } from './assistance/staff-assistance.controller'
import { StaffAssistanceService } from './assistance/staff-assistance.service'
import { BookingAssistanceController } from './assistance/booking-assistance.controller'
import { BookingAssistanceService } from './assistance/booking-assistance.service'
import { FlightEventsService } from './flight-events/flight-events.service'
import { SeatPaymentService } from './seats/seat-payment.service'
import { DevSeatPaymentController } from './seats/dev-seat-payment.controller'
import { FlightEventHandlerService } from './flight-events/flight-event-handler.service'
import { FlightEventCatchupService } from './flight-events/flight-event-catchup.service'
import { FlightCancellationProcessor } from './flight-events/flight-cancellation.processor'
import { AircraftChangeProcessor } from './flight-events/aircraft-change.processor'
import { FlightEventNotificationsService } from './flight-events/flight-event-notifications.service'

import { LoyaltyModule } from '@backend/modules/loyalty/loyalty.module'
import { LoyaltyInsuranceAdapter } from './providers/loyalty-insurance.adapter'
import { BookingInsuranceController } from './insurance/insurance.controller'
import { BookingInsuranceService } from './insurance/insurance.service'

@Module({
  // Feature 15's audit writer, for the staff cancellation entry (B7).
  // Feature 4's pricing module, so the pricing port is the real adapter.
  // Feature 11's loyalty module, for the travel insurance policy.
  imports: [AuditModule, PricingModule, LoyaltyModule, FlightSchedulingModule, PaymentsRefundsModule, PaymentsCheckoutModule],
  controllers: [
    DevSeatPaymentController,
    DevConfirmController,
    BookingInsuranceController,
    BookingsController,
    CustomerBookingsController,
    CancelController,
    HoldController,
    StaffBookingController,
    SeatMapController,
    SeatChangeController,
    StaffAssistanceController,
    BookingAssistanceController,
  ],
  providers: [
    SeatPaymentService,
    FlightEventsService,
    FlightEventHandlerService,
    FlightEventCatchupService,
    FlightCancellationProcessor,
    AircraftChangeProcessor,
    FlightEventNotificationsService,
    SeatMapService,
    SeatChangeService,
    HeldSeatChangeService,
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
    BookingStatusService,
    ConfirmService,
    ReleaseService,
    CancelService,
    CancelForFlightService,
    HoldExpiryJob,
    BookingReadService,
    BookingContactService,
    // Global, but it only catches BookingError, so other modules' errors are untouched.
    { provide: APP_FILTER, useClass: BookingErrorFilter },
    { provide: BOOKING_CLOCK, useExisting: SimulationClock },
    { provide: BOOKING_EVENT_BUS, useClass: LocalBookingEventBus },
    { provide: INVENTORY_PORT, useClass: InventoryService },
    { provide: SEAT_PORT, useClass: SeatService },
    { provide: SERVICE_REQUEST_PORT, useExisting: AssistanceService },
    { provide: PRICING_PORT, useClass: PricingAdapter },
    { provide: LOYALTY_PORT, useClass: LoyaltyStub },
    // Feature 5 records the add-on payment with its line, receipt and journal rows; the stub only wrote the payment row.
    { provide: CHECKOUT_PORT, useExisting: BookingChargeAdapter },
    // Feature 5 pays refunds (and voids a payment that was only authorised); the stub only recorded the request.
    { provide: REFUND_PORT, useExisting: BookingRefundAdapter },
    { provide: SCREENING_PORT, useClass: ScreeningStub },
    { provide: SEAT_MAP_PORT, useClass: AircraftSeatMapAdapter },
    { provide: INSURANCE_PORT, useClass: LoyaltyInsuranceAdapter },
    BookingInsuranceService,
    { provide: BOOKING_READ_PORT, useExisting: BookingReadService },
    { provide: CANCEL_FOR_FLIGHT_PORT, useExisting: CancelForFlightService },
    { provide: FLIGHT_EVENT_SOURCE, useClass: SchedulingFlightEventSource },
    { provide: BOOKING_PROVIDER, useClass: BookingProviderAdapter },
  ],
  exports: [
    // Feature 5 reads the insurance offer and issues the policy once a booking is paid.
    BookingInsuranceService,
    SeatPaymentService,
    CheckinSeatProvider,
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
    INSURANCE_PORT,
    BOOKING_READ_PORT,
    CANCEL_FOR_FLIGHT_PORT,
    BOOKING_PROVIDER,
    FlightImpactService,
  ],
})
export class BookingPnrModule {}
