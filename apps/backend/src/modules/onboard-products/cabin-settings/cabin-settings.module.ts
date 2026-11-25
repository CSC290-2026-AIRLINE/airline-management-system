// CabinSettings module: per-cabin meal/snack/duty-free policy with
// three-level resolution (flight → route → network, NULL inherits).
// One PUT endpoint to upsert any scope, plus the read endpoints
// /network, /:routeId, /:flightId that return the rows for that scope
// and the /resolve/:flightId helper the catering-orders flow uses to
// compute the cutoff.

import { Module } from '@nestjs/common'
import { CabinSettingsController } from './cabin-settings.controller'
import { CabinSettingsService } from './cabin-settings.service'

@Module({
  controllers: [CabinSettingsController],
  providers: [CabinSettingsService],
  exports: [CabinSettingsService],
})
export class CabinSettingsModule {}
