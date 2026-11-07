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

@Module({
  imports: [AuditModule, BaggageModule],
  controllers: [PassengerLostReportController],
  providers: [
    BaggageCustomerGuard,
    PassengerDeliveryChoiceService,
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
      ) => new ReportService(repository, bookings, checkedBags, sequence, clock),
      inject: [PrismaReportRepository, PrismaBookingVerification, PrismaCheckedBagLookup, PrismaCaseNumberSequence, SimulationClock],
    },
  ],
  exports: [ReportService],
})
export class PassengerLostReportModule {}
