import { Module } from '@nestjs/common'
import { ReportService } from './report.service'
import { PrismaReportRepository } from './prisma-report.repository'
import { PrismaBookingVerification } from './prisma-booking.verification'
import { PrismaCheckedBagLookup } from './prisma-checked-bag.lookup'
import { PrismaCaseNumberSequence } from './prisma-case-number.sequence'
import { PassengerLostReportController } from './passenger-lost-report.controller'
import { BaggageCustomerGuard } from './guards/baggage-customer.guard'

@Module({
  controllers: [PassengerLostReportController],
  providers: [
    BaggageCustomerGuard,
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
      ) => new ReportService(repository, bookings, checkedBags, sequence, { now: () => new Date() }),
      inject: [PrismaReportRepository, PrismaBookingVerification, PrismaCheckedBagLookup, PrismaCaseNumberSequence],
    },
  ],
  exports: [ReportService],
})
export class PassengerLostReportModule {}
