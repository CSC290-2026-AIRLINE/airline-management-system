import { BadRequestException, Injectable } from '@nestjs/common'
import { buildQuoteLines, toCents, type QuoteLine } from '../fare-quote/quote-calculator'
import { simulatedToday } from '../finance/finance.constants'
import { RULE_GROUPS, type SeatType } from '../pricing.constants'
import { PricingErrorCode, pricingError } from '../pricing.errors'
import { SeatFeeService } from '../seat-fee/seat-fee.service'
import { SettingService } from '../setting/setting.service'
import { TaxFeeService } from '../tax-fee/tax-fee.service'
import { SimulatePriceDto } from './dto/simulate-price.dto'
import { dateOnly } from './pricing-rule.engine'
import { PricingRuleService } from './pricing-rule.service'

const DAY_MS = 86_400_000
// The staff page shows economy seat fees only, so the simulator prices the same cabin.
const CABIN = 'economy'

const SEAT_LABELS: Record<SeatType, string> = { normal: 'Normal seat', exit_row: 'Exit row', extra_legroom: 'Extra legroom' }

const PERCENT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function signedPercent(pct: number): string {
  return `${pct < 0 ? '−' : '+'}${PERCENT.format(Math.abs(pct))}%`
}

function lineDetail(line: QuoteLine): string {
  if (line.ratePct === null) return 'flat'
  return line.kind === 'rule' ? signedPercent(line.ratePct) : `${PERCENT.format(line.ratePct)}%`
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

    const seatFee = seatFees.find((fee) => fee.cabin === CABIN && fee.seat_type === dto.seat_type)
    const seatCents = seatFee ? toCents(Number(seatFee.amount)) : 0
    const { lines, totalCents } = buildQuoteLines({
      baseCents: toCents(dto.base_fare),
      rules: ruled.applied,
      seatFee: seatCents > 0 ? { label: SEAT_LABELS[dto.seat_type], cents: seatCents } : undefined,
      taxes: taxFees.map((tax) => ({ id: tax.id, name: tax.name, kind: tax.kind, calc_type: tax.calc_type, value: Number(tax.value) })),
    })

    const matched = new Set(ruled.applied.map((rule) => rule.rule_group))
    return {
      today: dateOnly(today),
      days_to_departure: daysToDeparture,
      currency,
      lines: lines.map((line) => ({
        label: line.label,
        ...(line.kind !== 'base' && { detail: lineDetail(line) }),
        amount: line.amountCents / 100,
      })),
      total: totalCents / 100,
      unmatched_groups: RULE_GROUPS.filter((group) => !matched.has(group)),
      quote_hold_minutes: holdMinutes,
    }
  }
}
