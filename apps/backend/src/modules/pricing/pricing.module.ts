import { Module } from '@nestjs/common'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { ExpenseController } from './finance/expense/expense.controller'
import { ExpenseService } from './finance/expense/expense.service'
import { PaymentScheduleController } from './finance/payment-schedule/payment-schedule.controller'
import { PaymentScheduleService } from './finance/payment-schedule/payment-schedule.service'
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
    SeatFeeController,
    PublicSeatFeeController,
    TaxFeeController,
    CurrencyRateController,
    PaymentScheduleController,
    ExpenseController,
  ],
  providers: [
    FareClassService,
    BaseFareService,
    SettingService,
    SeatFeeService,
    TaxFeeService,
    CurrencyRateService,
    PaymentScheduleService,
    ExpenseService,
  ],
  exports: [FareClassService, BaseFareService, SettingService, SeatFeeService, TaxFeeService, CurrencyRateService],
})
export class PricingModule {}
