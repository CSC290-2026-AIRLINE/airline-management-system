import { StaffProfilesGuard } from './staff-profiles.guard'
import { ScreeningModule } from '@backend/modules/screening/screening.module'
import { Module } from '@nestjs/common'
import { DbModule } from '@backend/db/db.module'
import { CustomerAccountProfilesController } from './customer-account-profiles.controller'
import { CustomerAccountProfilesService } from './customer-account-profiles.service'
import { CustomerIdentityController } from './customer-identity.controller'
import { CustomerProfilesController } from './customer-profiles.controller'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { PassengerProfilesService } from './passenger-profiles.service'
import { ProfileIdentityService } from './profile-identity.service'

@Module({
  imports: [DbModule, ScreeningModule],
  controllers: [CustomerAccountProfilesController, CustomerIdentityController, PassengerProfilesController, CustomerProfilesController],
  providers: [StaffProfilesGuard, CustomerAccountProfilesService, ProfileIdentityService, PassengerProfilesService],
  exports: [PassengerProfilesService],
})
export class PassengerProfilesModule {}
