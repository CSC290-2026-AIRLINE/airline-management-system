import { Module } from '@nestjs/common'
import { CustomerProfilesController } from './customer-profiles.controller'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { PassengerProfilesService } from './passenger-profiles.service'

/**
 * `DbModule` is `@Global()`, so `DbService` resolves without importing it here.
 */
@Module({
  controllers: [PassengerProfilesController, CustomerProfilesController],
  providers: [PassengerProfilesService],
  exports: [PassengerProfilesService],
})
export class PassengerProfilesModule {}
