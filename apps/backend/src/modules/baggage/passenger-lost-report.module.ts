import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client } from '@aws-sdk/client-s3'
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
import { LOST_REPORT_PHOTO_S3_CLIENT, LostReportPhotoStorage } from './lost-report-photo.storage'

@Module({
  imports: [AuditModule, BaggageModule],
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
    {
      provide: LOST_REPORT_PHOTO_S3_CLIENT,
      useFactory: (config: ConfigService) => {
        const accessKey = config.get<string>('S3_ACCESS_KEY')
        const secretKey = config.get<string>('S3_SECRET_KEY')
        return new S3Client({
          endpoint: config.get<string>('S3_ENDPOINT'),
          region: 'us-east-1',
          forcePathStyle: true,
          ...(accessKey && secretKey ? { credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } } : {}),
        })
      },
      inject: [ConfigService],
    },
    LostReportPhotoStorage,
  ],
  exports: [ReportService],
})
export class PassengerLostReportModule {}
