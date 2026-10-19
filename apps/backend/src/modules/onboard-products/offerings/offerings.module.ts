// Offerings module: which products are available at each (route,
// flight, cabin). Only default offerings are surfaced through the
// /staff/product-offerings route; the Offered Menu page uses the
// resolved cabin settings to decide which products are visible.

import { Module } from '@nestjs/common'
import { OfferingsController } from './offerings.controller'
import { OfferingsService } from './offerings.service'

@Module({
  controllers: [OfferingsController],
  providers: [OfferingsService],
  exports: [OfferingsService],
})
export class OfferingsModule {}
