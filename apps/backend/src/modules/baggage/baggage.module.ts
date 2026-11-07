import { Module } from '@nestjs/common'
import { FOUND_BAG_CLOCK, FOUND_BAG_RECORDED_LISTENERS, type FoundBagClock, type FoundBagRecordedListener } from './common/found-bag.ports'
import { BagMatchController } from './bag-match.controller'
import { BagMatchReviewService } from './bag-match-review.service'
import { BagMatchingService } from './bag-matching.service'
import { BagCostService } from './bag-cost.service'
import { BagTrackingService } from './bag-tracking.service'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import { FoundBagController } from './found-bag.controller'
import { FoundBagService } from './found-bag.service'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'
import { StationContactController } from './station-contact.controller'
import { StationContactService } from './station-contact.service'
import { StaffLostReportController } from './staff-lost-report.controller'
import { StaffLostReportService } from './staff-lost-report.service'

/**
 * Feature 10 (Lost and Found Baggage).
 * `DbModule` is `@Global()`, so `DbService` needs no import here.
 */
@Module({
  controllers: [FoundBagController, StationContactController, StaffLostReportController, BagMatchController],
  providers: [
    FoundBagService,
    BagTrackingService,
    StationContactService,
    FoundBagLifecycleService,
    StaffLostReportService,
    BagCostService,
    BagMatchingService,
    BagMatchReviewService,
    BaggageStaffGuard,
    // Every saved found bag is matched against open and lost reports.
    {
      provide: FOUND_BAG_RECORDED_LISTENERS,
      useFactory: (matching: BagMatchingService): FoundBagRecordedListener[] => [matching],
      inject: [BagMatchingService],
    },
    // Real time until a shared simulation clock is exported for other modules to use.
    { provide: FOUND_BAG_CLOCK, useValue: { now: () => new Date() } satisfies FoundBagClock },
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
  ],
})
export class BaggageModule {}
