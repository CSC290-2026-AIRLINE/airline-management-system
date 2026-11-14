import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client } from '@aws-sdk/client-s3'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { FOUND_BAG_CLOCK, FOUND_BAG_RECORDED_LISTENERS, type FoundBagRecordedListener } from './common/found-bag.ports'
import { BaggageDeskController } from './baggage-desk.controller'
import { BaggageFlightController } from './baggage-flight.controller'
import { BaggageSettingsController } from './baggage-settings.controller'
import { BaggageSettingsService } from './baggage-settings.service'
import { BaggageAdminGuard } from './guards/baggage-admin.guard'
import { BaggageFlightService } from './baggage-flight.service'
import { BagMatchController } from './bag-match.controller'
import { BagMatchReviewService } from './bag-match-review.service'
import { BagMatchingService } from './bag-matching.service'
import { BagCostService } from './bag-cost.service'
import { BagDeliveryController } from './bag-delivery.controller'
import { BagDeliveryService } from './bag-delivery.service'
import { BagTrackingService } from './bag-tracking.service'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { FoundBagUnclaimedRunner } from './found-bag-unclaimed.runner'
import { FoundBagController } from './found-bag.controller'
import { FoundBagService } from './found-bag.service'
import { LOST_REPORT_PHOTO_S3_CLIENT, LostReportPhotoStorage } from './lost-report-photo.storage'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'
import { StationContactController } from './station-contact.controller'
import { StationContactService } from './station-contact.service'
import { StaffLostReportController } from './staff-lost-report.controller'
import { StaffLostReportService } from './staff-lost-report.service'

/**
 * Feature 10 (Lost and Found Baggage).
 * `DbModule` is `@Global()`, so `DbService` needs no import here. `AuditModule` brings the audit writer (ownership checks
 * at handover) and the shared simulation clock.
 */
@Module({
  imports: [AuditModule],
  controllers: [
    FoundBagController,
    StationContactController,
    StaffLostReportController,
    BagMatchController,
    BagDeliveryController,
    BaggageFlightController,
    BaggageSettingsController,
    BaggageDeskController,
  ],
  providers: [
    FoundBagService,
    BagTrackingService,
    StationContactService,
    FoundBagLifecycleService,
    // Marks held bags unclaimed after unclaimed_after_days without a staff request.
    FoundBagUnclaimedRunner,
    StaffLostReportService,
    BagCostService,
    BagMatchingService,
    BagMatchReviewService,
    BagDeliveryService,
    BaggageFlightService,
    BaggageStaffGuard,
    BaggageAdminGuard,
    BaggageSettingsService,
    // Every saved found bag is matched against open and lost reports.
    {
      provide: FOUND_BAG_RECORDED_LISTENERS,
      useFactory: (matching: BagMatchingService): FoundBagRecordedListener[] => [matching],
      inject: [BagMatchingService],
    },
    // Lost bag photos (private bucket): passengers upload them, the desk views them.
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
    // Business timestamps follow the one simulation clock, which AuditModule owns.
    { provide: FOUND_BAG_CLOCK, useExisting: SimulationClock },
  ],
  exports: [
    FoundBagService,
    BagTrackingService,
    StationContactService,
    FoundBagLifecycleService,
    StaffLostReportService,
    BagCostService,
    BagMatchingService,
    BagMatchReviewService,
    BagDeliveryService,
    LostReportPhotoStorage,
  ],
})
export class BaggageModule {}
