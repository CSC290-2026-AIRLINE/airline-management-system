import { Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '../admin-console/admin-console.module'
import { AdminConsoleService } from '../admin-console/admin-console.service'
import { BookingSeatAvailabilityModule } from '@backend/modules/booking-pnr/inventory/booking-seat-availability.module'
import { BaggageChargeController, BaggageRateController } from './baggage-rate/baggage-rate.controller'
import { BaggageRateService } from './baggage-rate/baggage-rate.service'
import { CurrencyRateController } from './currency-rate/currency-rate.controller'
import { CurrencyRateService } from './currency-rate/currency-rate.service'
import { BaseFareController } from './base-fare/base-fare.controller'
import { BaseFareService } from './base-fare/base-fare.service'
import { FareClassController, PublicFareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { FareQuoteController } from './fare-quote/fare-quote.controller'
import { FareQuoteService } from './fare-quote/fare-quote.service'
import { ExpenseController } from './finance/expense/expense.controller'
import { ExpenseService } from './finance/expense/expense.service'
import { FinanceSummaryController } from './finance/summary/finance-summary.controller'
import { FinanceSummaryService } from './finance/summary/finance-summary.service'
import { PaymentScheduleController } from './finance/payment-schedule/payment-schedule.controller'
import { PaymentScheduleService } from './finance/payment-schedule/payment-schedule.service'
import { PricingAudit } from './pricing.audit'
import { F04_SCREENS } from './pricing.screens'
import { PricingRuleController, PricingRuleOrderController, PricingSimulationController } from './pricing-rule/pricing-rule.controller'
import { PricingRuleService } from './pricing-rule/pricing-rule.service'
import { PricingSimulatorService } from './pricing-rule/pricing-simulator.service'
import { PromoCodeController, PromoRedemptionController } from './promo-code/promo-code.controller'
import { PromoCodeService } from './promo-code/promo-code.service'
import { PublicSeatFeeController, SeatFeeController } from './seat-fee/seat-fee.controller'
import { SeatFeeService } from './seat-fee/seat-fee.service'
import { SettingController } from './setting/setting.controller'
import { SettingService } from './setting/setting.service'
import { TaxFeeController } from './tax-fee/tax-fee.controller'
import { TaxFeeService } from './tax-fee/tax-fee.service'

@Module({
  imports: [AdminConsoleModule, BookingSeatAvailabilityModule],
  controllers: [
    FareClassController,
    PublicFareClassController,
    BaseFareController,
    SettingController,
    PricingRuleController,
    PricingRuleOrderController,
    PricingSimulationController,
    PromoCodeController,
    PromoRedemptionController,
    FareQuoteController,
    SeatFeeController,
    PublicSeatFeeController,
    TaxFeeController,
    CurrencyRateController,
    PaymentScheduleController,
    BaggageRateController,
    BaggageChargeController,
    ExpenseController,
    FinanceSummaryController,
  ],
  providers: [
    PricingAudit,
    FareClassService,
    BaseFareService,
    SettingService,
    PricingRuleService,
    PricingSimulatorService,
    PromoCodeService,
    FareQuoteService,
    SeatFeeService,
    TaxFeeService,
    CurrencyRateService,
    PaymentScheduleService,
    ExpenseService,
    BaggageRateService,
    FinanceSummaryService,
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
export class PricingModule implements OnModuleInit {
  constructor(private readonly adminConsole: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    // Idempotent upsert on `code`, so the pricing screens appear in Role access without a manual insert.
    await this.adminConsole.registerSelfScreens(F04_SCREENS)
  }
}
