import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { BaggageModule } from './baggage.module'
import { BaggageLifecycleModule } from './baggage-lifecycle.module'
import { BaggageCaseNotices } from './baggage-case-notices'
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

/** The photo storage comes from BaggageModule, which the staff desk shares. */
@Module({
  imports: [AuditModule, BaggageModule, BaggageLifecycleModule],
  controllers: [PassengerLostReportController, PassengerLostReportFlightsController, PassengerLostReportTravellersController],
  providers: [
    BaggageCustomerGuard,
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
        notices: BaggageCaseNotices,
      ) => new ReportService(repository, bookings, checkedBags, sequence, clock, photos, notices),
      inject: [
        PrismaReportRepository,
        PrismaBookingVerification,
        PrismaCheckedBagLookup,
        PrismaCaseNumberSequence,
        SimulationClock,
        LostReportPhotoStorage,
        BaggageCaseNotices,
      ],
    },
  ],
  exports: [ReportService],
})
export class PassengerLostReportModule {}
