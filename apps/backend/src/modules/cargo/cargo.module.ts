import { Module } from '@nestjs/common'
import { CargoController } from './cargo.controller'
import { CargoService } from './cargo.service'
import { CargoSettingsController } from './cargo-settings.controller'
import { CargoSettingsService } from './cargo-settings.service'
import { CargoEventsService } from './cargo-events.service'

@Module({
  controllers: [CargoController, CargoSettingsController],
  providers: [CargoService, CargoSettingsService, CargoEventsService],
  exports: [CargoService, CargoSettingsService, CargoEventsService],
})
export class CargoModule {}
