import { BadRequestException, Injectable } from '@nestjs/common'
import { simulatedToday } from '../finance/finance.constants'
import { RULE_GROUPS, type SeatType } from '../pricing.constants'
import { PricingErrorCode, pricingError } from '../pricing.errors'
import { SeatFeeService } from '../seat-fee/seat-fee.service'
import { SettingService } from '../setting/setting.service'
import { TaxFeeService } from '../tax-fee/tax-fee.service'
import { SimulatePriceDto } from './dto/simulate-price.dto'
import { dateOnly, percentOfCents } from './pricing-rule.engine'
import { PricingRuleService } from './pricing-rule.service'

const DAY_MS = 86_400_000
// The staff page shows economy seat fees only, so the simulator prices the same cabin.
const CABIN = 'economy'

const SEAT_LABELS: Record<SeatType, string> = { normal: 'Normal seat', exit_row: 'Exit row', extra_legroom: 'Extra legroom' }

const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function signedPercent(pct: number): string {
  return `${pct < 0 ? '−' : '+'}${PERCENT.format(Math.abs(pct))}%`
}

export interface SimulatedLine {
  label: string
  detail?: string
  amount: number
}

@Injectable()
export class PricingSimulatorService {
  constructor(
    private readonly pricingRules: PricingRuleService,
    private readonly seatFees: SeatFeeService,
    private readonly taxFees: TaxFeeService,
    private readonly settings: SettingService,
  ) {}

  // Dry run of the quote calculation for one passenger: reads only, and writes no quote, line or redemption.
  // Order follows the schema review: rules, then seat fee, then taxes on that subtotal (percentages do not compound).
  // Without a fare class, class-specific rules are skipped. Promo codes join once the promo module exists.
  async simulate(dto: SimulatePriceDto) {
    const today = simulatedToday()
    const daysToDeparture = Math.round((new Date(`${dto.departure_date}T00:00:00.000Z`).getTime() - today.getTime()) / DAY_MS)
    if (Number.isNaN(daysToDeparture) || daysToDeparture < 0) {
      throw new BadRequestException(pricingError(PricingErrorCode.SIMULATION_INVALID, 'Departure must be today or later'))
    }

    const [ruled, seatFees, taxFees, currency, holdMinutes] = await Promise.all([
      this.pricingRules.applyRules(dto.base_fare, {
        fareClassId: null,
        daysToDeparture,
        seatsLeftPct: dto.seats_left_pct,
        departureDate: dto.departure_date,
      }),
      this.seatFees.findAll(),
      this.taxFees.findAll(),
      this.settings.getBaseCurrency(),
      this.settings.getQuoteHoldMinutes(),
    ])

    const lines: SimulatedLine[] = [{ label: 'Base fare', amount: dto.base_fare }]
    for (const rule of ruled.applied) {
      lines.push({
        label: `${rule.name} (${rule.rule_group})`,
        detail: signedPercent(rule.adjustment_pct),
        amount: (Math.round(rule.amount_after * 100) - Math.round(rule.amount_before * 100)) / 100,
      })
    }

    const seatFee = seatFees.find((fee) => fee.cabin === CABIN && fee.seat_type === dto.seat_type)
    const seatCents = seatFee ? Math.round(Number(seatFee.amount) * 100) : 0
    if (seatCents > 0) {
      lines.push({ label: SEAT_LABELS[dto.seat_type], detail: 'flat', amount: seatCents / 100 })
    }

    const subtotalCents = Math.round(ruled.amount * 100) + seatCents
    let totalCents = subtotalCents
    for (const tax of taxFees) {
      const value = Number(tax.value)
      const isPercent = tax.calc_type === 'pct'
      const cents = isPercent ? percentOfCents(subtotalCents, value) : Math.round(value * 100)
      totalCents += cents
      lines.push({ label: tax.name, detail: isPercent ? `${PERCENT.format(value)}%` : 'flat', amount: cents / 100 })
    }

    const matched = new Set(ruled.applied.map((rule) => rule.rule_group))
    return {
      today: dateOnly(today),
      days_to_departure: daysToDeparture,
      currency,
      lines,
      total: totalCents / 100,
      unmatched_groups: RULE_GROUPS.filter((group) => !matched.has(group)),
      quote_hold_minutes: holdMinutes,
    }
  }
}
