import { Module } from '@nestjs/common'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import { FoundBagService } from './found-bag.service'

/**
 * Feature 10 (Lost and Found Baggage). Not registered in AppModule yet; add it there with the first controller.
 * `DbModule` is `@Global()`, so `DbService` needs no import here.
 */
@Module({
  providers: [
    FoundBagService,
    // Real time until a shared simulation clock is exported for other modules to use.
    { provide: FOUND_BAG_CLOCK, useValue: { now: () => new Date() } satisfies FoundBagClock },
  ],
  exports: [FoundBagService],
})
export class BaggageModule {}
