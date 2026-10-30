import { Module } from '@nestjs/common'
import { BaggageChargeController, BaggageRateController } from './baggage-rate/baggage-rate.controller'
import { BaggageRateService } from './baggage-rate/baggage-rate.service'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { FareQuoteController } from './fare-quote/fare-quote.controller'
import { FareQuoteService } from './fare-quote/fare-quote.service'
import { NoBookingsSeatAvailability, SeatAvailability } from './fare-quote/seat-availability'
import { ExpenseController } from './finance/expense/expense.controller'
import { ExpenseService } from './finance/expense/expense.service'
import { PaymentScheduleController } from './finance/payment-schedule/payment-schedule.controller'
import { PaymentScheduleService } from './finance/payment-schedule/payment-schedule.service'
import { PricingRuleController } from './pricing-rule/pricing-rule.controller'
import { PricingRuleService } from './pricing-rule/pricing-rule.service'
import { PricingSimulatorService } from './pricing-rule/pricing-simulator.service'
import { PromoCodeController } from './promo-code/promo-code.controller'
import { PromoCodeService } from './promo-code/promo-code.service'
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
    PromoCodeController,
    FareQuoteController,
    SeatFeeController,
    PublicSeatFeeController,
    TaxFeeController,
    CurrencyRateController,
    PaymentScheduleController,
    BaggageRateController,
    BaggageChargeController,
    ExpenseController,
  ],
  providers: [
    FareClassService,
    BaseFareService,
    SettingService,
    PricingRuleService,
    PricingSimulatorService,
    PromoCodeService,
    FareQuoteService,
    // Swap this one line for Feature 3b's provider when it exists.
    { provide: SeatAvailability, useClass: NoBookingsSeatAvailability },
    SeatFeeService,
    TaxFeeService,
    CurrencyRateService,
    PaymentScheduleService,
    ExpenseService,
    BaggageRateService,
  ],
  exports: [
    FareClassService,
    BaseFareService,
    SettingService,
    PricingRuleService,
    PromoCodeService,
    FareQuoteService,
    BaggageRateService,
    SeatFeeService,
    TaxFeeService,
    CurrencyRateService,
    ExpenseService,
  ],
})
export class PricingModule {}
