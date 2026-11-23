import { Module } from '@nestjs/common'
import { CargoController } from './cargo.controller'
import { CargoService } from './cargo.service'
import { CargoSettingsController } from './cargo-settings.controller'
import { CargoSettingsService } from './cargo-settings.service'
import { CargoEventsService } from './cargo-events.service'
import { CargoBookingService } from './cargo-booking.service'
import { CargoJobsRunner } from './cargo-jobs.runner'
import { CargoOperationsService } from './cargo-operations.service'
import { CargoDeskController } from './cargo-desk.controller'
import { CargoDeskService } from './cargo-desk.service'
import { CargoClaimsController } from './cargo-claims.controller'
import { CargoClaimsService } from './cargo-claims.service'
import { CargoCustomerController } from './cargo-customer.controller'
import { CargoCustomerService } from './cargo-customer.service'
import { CargoCustomerMockController } from './cargo-customer-mock.controller'
import { CargoTestToolsController } from './cargo-test-tools.controller'

const devControllers = process.env.NODE_ENV !== 'production' ? [CargoTestToolsController, CargoCustomerMockController] : []

@Module({
  controllers: [
    CargoController,
    CargoSettingsController,
    CargoDeskController,
    CargoClaimsController,
    CargoCustomerController,
    ...devControllers,
  ],
  providers: [
    CargoService,
    CargoSettingsService,
    CargoEventsService,
    CargoOperationsService,
    CargoJobsRunner,
    CargoBookingService,
    CargoDeskService,
    CargoClaimsService,
    CargoCustomerService,
  ],
  exports: [
    CargoService,
    CargoSettingsService,
    CargoEventsService,
    CargoBookingService,
    CargoDeskService,
    CargoClaimsService,
    CargoCustomerService,
  ],
})
export class CargoModule {}
