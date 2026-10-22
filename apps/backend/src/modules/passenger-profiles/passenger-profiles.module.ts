import { Module } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { PassengerProfilesService } from './passenger-profiles.service'
import { ProfileIdentityService } from './profile-identity.service'
import { CustomerIdentityController } from './customer-identity.controller'

@Module({
  imports: [DbModule],
  controllers: [PassengerProfilesController, CustomerIdentityController],
  providers: [PassengerProfilesService, ProfileIdentityService],
})
export class PassengerProfilesModule {}
