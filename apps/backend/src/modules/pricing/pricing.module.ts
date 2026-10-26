import { Module } from '@nestjs/common'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { SettingController } from './setting/setting.controller'
import { SettingService } from './setting/setting.service'

@Module({
  controllers: [FareClassController, BaseFareController, SettingController],
  providers: [FareClassService, BaseFareService, SettingService],
  exports: [FareClassService, BaseFareService, SettingService],
})
export class PricingModule {}
