import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { BaggageModule } from './baggage.module'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { ReportService } from './report.service'
import { PrismaReportRepository } from './prisma-report.repository'
import { PrismaBookingVerification } from './prisma-booking.verification'
import { PrismaCheckedBagLookup } from './prisma-checked-bag.lookup'
import { PrismaCaseNumberSequence } from './prisma-case-number.sequence'
import { PassengerLostReportController } from './passenger-lost-report.controller'
import { BaggageCustomerGuard } from './guards/baggage-customer.guard'
import { PassengerDeliveryChoiceService } from './passenger-delivery-choice.service'
import { PassengerLostReportFlightsController } from './passenger-lost-report-flights.controller'
import { PassengerLostReportTravellersController } from './passenger-lost-report-travellers.controller'
import { PassengerCaseSummaryService } from './passenger-case-summary.service'
import { LostReportPhotoStorage } from './lost-report-photo.storage'
import { GuestLostReportFlightsController } from './guest-lost-report-flights.controller'
import { GuestLostReportTravellersController } from './guest-lost-report-travellers.controller'
import { GuestLostReportController } from './guest-lost-report.controller'
import { GuestBookingLookupService } from './guest-booking-lookup.service'
import { GuestLostReportCaseLookupController } from './guest-lost-report-case-lookup.controller'
import { GuestCaseLookupService } from './guest-case-lookup.service'

/** The photo storage comes from BaggageModule, which the staff desk shares. */
@Module({
  imports: [AuditModule, BaggageModule],
  controllers: [
    PassengerLostReportController,
    PassengerLostReportFlightsController,
    PassengerLostReportTravellersController,
    GuestLostReportFlightsController,
    GuestLostReportTravellersController,
    GuestLostReportController,
    GuestLostReportCaseLookupController,
  ],
  providers: [
    BaggageCustomerGuard,
    GuestBookingLookupService,
    GuestCaseLookupService,
    PassengerDeliveryChoiceService,
    PassengerCaseSummaryService,
    PrismaReportRepository,
    PrismaBookingVerification,
    PrismaCheckedBagLookup,
    PrismaCaseNumberSequence,
    {
      provide: ReportService,
      useFactory: (
        repository: PrismaReportRepository,
        bookings: PrismaBookingVerification,
        checkedBags: PrismaCheckedBagLookup,
        sequence: PrismaCaseNumberSequence,
        clock: SimulationClock,
        photos: LostReportPhotoStorage,
      ) => new ReportService(repository, bookings, checkedBags, sequence, clock, photos),
      inject: [
        PrismaReportRepository,
        PrismaBookingVerification,
        PrismaCheckedBagLookup,
        PrismaCaseNumberSequence,
        SimulationClock,
        LostReportPhotoStorage,
      ],
    },
  ],
  exports: [ReportService],
})
export class PassengerLostReportModule {}
