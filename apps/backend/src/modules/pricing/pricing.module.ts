import { Module } from '@nestjs/common'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { PaymentScheduleController } from './finance/payment-schedule/payment-schedule.controller'
import { PaymentScheduleService } from './finance/payment-schedule/payment-schedule.service'

@Module({
  controllers: [FareClassController, CurrencyRateController, PaymentScheduleController],
  providers: [FareClassService, CurrencyRateService, PaymentScheduleService],
  exports: [FareClassService, CurrencyRateService],
})
export class PricingModule {}
