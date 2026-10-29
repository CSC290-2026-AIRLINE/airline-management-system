import { Module } from '@nestjs/common'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { PaymentScheduleController } from './finance/payment-schedule/payment-schedule.controller'
import { PaymentScheduleService } from './finance/payment-schedule/payment-schedule.service'
import { PricingRuleController } from './pricing-rule/pricing-rule.controller'
import { PricingRuleService } from './pricing-rule/pricing-rule.service'
import { PublicSeatFeeController, SeatFeeController } from './seat-fee/seat-fee.controller'
import { SeatFeeService } from './seat-fee/seat-fee.service'
import { SettingController } from './setting/setting.controller'
import { SettingService } from './setting/setting.service'
import { TaxFeeController } from './tax-fee/tax-fee.controller'
import { TaxFeeService } from './tax-fee/tax-fee.service'

@Module({
  controllers: [
    FareClassController,
    BaseFareController,
    SettingController,
    PricingRuleController,
    SeatFeeController,
    PublicSeatFeeController,
    TaxFeeController,
    CurrencyRateController,
    PaymentScheduleController,
  ],
  providers: [
    FareClassService,
    BaseFareService,
    SettingService,
    PricingRuleService,
    SeatFeeService,
    TaxFeeService,
    CurrencyRateService,
    PaymentScheduleService,
  ],
  exports: [FareClassService, BaseFareService, SettingService, PricingRuleService, SeatFeeService, TaxFeeService, CurrencyRateService],
})
export class PricingModule {}
