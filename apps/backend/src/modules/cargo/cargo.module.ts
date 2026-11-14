import { Module } from '@nestjs/common'
import { CargoController } from './cargo.controller'
import { CargoService } from './cargo.service'
import { CargoSettingsController } from './cargo-settings.controller'
import { CargoSettingsService } from './cargo-settings.service'
import { CargoEventsService } from './cargo-events.service'
import { CargoBookingService } from './cargo-booking.service'
import { CargoDeskController } from './cargo-desk.controller'
import { CargoDeskService } from './cargo-desk.service'
import { CargoClaimsController } from './cargo-claims.controller'
import { CargoClaimsService } from './cargo-claims.service'
import { CargoTestToolsController } from './cargo-test-tools.controller'

const devControllers = process.env.NODE_ENV !== 'production' ? [CargoTestToolsController] : []

@Module({
  controllers: [CargoController, CargoSettingsController, CargoDeskController, CargoClaimsController, ...devControllers],
  providers: [CargoService, CargoSettingsService, CargoEventsService, CargoBookingService, CargoDeskService, CargoClaimsService],
  exports: [CargoService, CargoSettingsService, CargoEventsService, CargoBookingService, CargoDeskService, CargoClaimsService],
})
export class CargoModule {}
