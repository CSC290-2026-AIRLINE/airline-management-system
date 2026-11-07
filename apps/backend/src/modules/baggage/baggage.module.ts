import { Module } from '@nestjs/common'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import { BagTrackingService } from './bag-tracking.service'
import { FoundBagController } from './found-bag.controller'
import { FoundBagService } from './found-bag.service'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'

/**
 * Feature 10 (Lost and Found Baggage).
 * `DbModule` is `@Global()`, so `DbService` needs no import here.
 */
@Module({
  controllers: [FoundBagController],
  providers: [
    FoundBagService,
    BagTrackingService,
    BaggageStaffGuard,
    // Real time until a shared simulation clock is exported for other modules to use.
    { provide: FOUND_BAG_CLOCK, useValue: { now: () => new Date() } satisfies FoundBagClock },
  ],
  exports: [FoundBagService, BagTrackingService],
})
export class BaggageModule {}
