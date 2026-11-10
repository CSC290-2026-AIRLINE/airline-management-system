import { Module } from '@nestjs/common'
import { AuditModule } from '@backend/modules/admin-console/audit/audit.module'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { FOUND_BAG_CLOCK, FOUND_BAG_RECORDED_LISTENERS, type FoundBagRecordedListener } from './common/found-bag.ports'
import { BaggageDeskController } from './baggage-desk.controller'
import { BaggageFlightController } from './baggage-flight.controller'
import { BaggageFlightService } from './baggage-flight.service'
import { BagMatchController } from './bag-match.controller'
import { BagMatchReviewService } from './bag-match-review.service'
import { BagMatchingService } from './bag-matching.service'
import { BagCostService } from './bag-cost.service'
import { BagDeliveryController } from './bag-delivery.controller'
import { BagDeliveryService } from './bag-delivery.service'
import { BagTrackingService } from './bag-tracking.service'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { FoundBagController } from './found-bag.controller'
import { FoundBagUnclaimedRunner } from './found-bag-unclaimed.runner'
import { FoundBagService } from './found-bag.service'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'
import { StationContactController } from './station-contact.controller'
import { StationContactService } from './station-contact.service'
import { StaffLostReportController } from './staff-lost-report.controller'
import { StaffLostReportService } from './staff-lost-report.service'
import { StaffNotificationController } from './staff-notification.controller'
import { StaffNotificationService } from './staff-notification.service'

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
    StaffNotificationController,
    BaggageFlightController,
    BaggageDeskController,
  ],
  providers: [
    FoundBagService,
    BagTrackingService,
    StationContactService,
    FoundBagLifecycleService,
    FoundBagUnclaimedRunner,
    StaffLostReportService,
    BagCostService,
    BagMatchingService,
    BagMatchReviewService,
    BagDeliveryService,
    StaffNotificationService,
    BaggageFlightService,
    BaggageStaffGuard,
    // Every saved found bag is matched against open and lost reports.
    {
      provide: FOUND_BAG_RECORDED_LISTENERS,
      useFactory: (matching: BagMatchingService): FoundBagRecordedListener[] => [matching],
      inject: [BagMatchingService],
    },
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
    StaffNotificationService,
  ],
})
export class BaggageModule {}
