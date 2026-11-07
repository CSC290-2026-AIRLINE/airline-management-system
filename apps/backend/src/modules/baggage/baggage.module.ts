import { Module } from '@nestjs/common'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
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
  controllers: [FoundBagController, StationContactController, StaffLostReportController],
  providers: [
    FoundBagService,
    BagTrackingService,
    StationContactService,
    FoundBagLifecycleService,
    StaffLostReportService,
    BagCostService,
    BaggageStaffGuard,
    // Real time until a shared simulation clock is exported for other modules to use.
    { provide: FOUND_BAG_CLOCK, useValue: { now: () => new Date() } satisfies FoundBagClock },
  ],
  exports: [FoundBagService, BagTrackingService, StationContactService, FoundBagLifecycleService, StaffLostReportService, BagCostService],
})
export class BaggageModule {}
