// SharedModule: the F12 services several sub-modules need but that do
// not belong to any one of them — the flight/airport lookups, the
// catering settings and the stock reservations. It is global so the
// sub-modules can inject them without importing each other.

import { Global, Module } from '@nestjs/common'
import { CateringSettingsService } from './catering-settings.service'
import { FlightContextService } from './flight-context.service'
import { ReservationsService } from './reservations.service'

@Global()
@Module({
  providers: [CateringSettingsService, FlightContextService, ReservationsService],
  exports: [CateringSettingsService, FlightContextService, ReservationsService],
})
export class SharedModule {}
