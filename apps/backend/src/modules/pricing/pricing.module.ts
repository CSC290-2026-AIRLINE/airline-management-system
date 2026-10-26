import { Module } from '@nestjs/common'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'

@Module({
  controllers: [FareClassController, CurrencyRateController],
  providers: [FareClassService, CurrencyRateService],
  exports: [FareClassService, CurrencyRateService],
})
export class PricingModule {}
