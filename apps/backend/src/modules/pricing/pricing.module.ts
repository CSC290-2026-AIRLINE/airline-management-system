import { Module } from '@nestjs/common'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { PublicSeatFeeController, SeatFeeController } from './seat-fee/seat-fee.controller'
import { SeatFeeService } from './seat-fee/seat-fee.service'
import { SettingController } from './setting/setting.controller'
import { SettingService } from './setting/setting.service'
import { TaxFeeController } from './tax-fee/tax-fee.controller'
import { TaxFeeService } from './tax-fee/tax-fee.service'

@Module({
  controllers: [FareClassController, BaseFareController, SettingController, SeatFeeController, PublicSeatFeeController, TaxFeeController, CurrencyRateController],
  providers: [FareClassService, BaseFareService, SettingService, SeatFeeService, TaxFeeService, CurrencyRateService],
  exports: [FareClassService, BaseFareService, SettingService, SeatFeeService, TaxFeeService, CurrencyRateService],d
})
export class PricingModule {}
