import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PricingErrorCode, pricingError } from '../../pricing.errors'
import { monthStart, simulatedNow, type ExpenseCategory } from '../finance.constants'
import { SummaryQueryDto } from './dto/summary-query.dto'

// A Prisma Decimal or a plain number: both have toFixed.
type Numeric = number | { toFixed(decimalPlaces: number): string }

// Every amount column of finance_monthly_summary except profit, as 2-decimal strings ("250000.00") for Prisma's Decimal.
export interface SummaryAmounts {
  revenue_amount: string
  pass_through_amount: string
  refund_amount: string
  maintenance_cost: string
  staff_cost: string
  catering_cost: string
  other_cost: string
}

type CostColumn = 'maintenance_cost' | 'staff_cost' | 'catering_cost' | 'other_cost'

const COST_COLUMNS: Record<ExpenseCategory, CostColumn> = {
  maintenance: 'maintenance_cost',
  staff: 'staff_cost',
  catering: 'catering_cost',
  other: 'other_cost',
}

@Injectable()
export class FinanceSummaryService {
  constructor(private readonly db: DbService) {}

  // Recalculates one month and saves it over the old row, so running it again gives the same single row.
  async recompute(month: string) {
    const start = monthStart(month)
    const amounts = { ...this.incomeFor(), ...(await this.costsFor(month)) }
    const row = { ...amounts, profit_amount: profitOf(amounts), computed_at: simulatedNow() }
    return this.db.finance_monthly_summary.upsert({ where: { month: start }, create: { month: start, ...row }, update: row })
  }

  find({ month, from, to }: SummaryQueryDto) {
    if (month && !from && !to) {
      return this.findOne(month)
    }
    if (!month && from && to) {
      return this.findRange(from, to)
    }
    throw new BadRequestException(
      pricingError(PricingErrorCode.FINANCE_SUMMARY_QUERY_INVALID, 'Use either ?month=2026-11 or ?from=2026-01&to=2026-12'),
    )
  }

  async findOne(month: string) {
    const summary = await this.db.finance_monthly_summary.findUnique({ where: { month: monthStart(month) } })
    if (!summary) {
      throw new NotFoundException(
        pricingError(PricingErrorCode.FINANCE_SUMMARY_NOT_FOUND, `No summary for ${month} yet; recompute it first`),
      )
    }
    return summary
  }

  // Only months that were recomputed have a row, so a range can have gaps.
  findRange(from: string, to: string) {
    if (from > to) {
      throw new BadRequestException(pricingError(PricingErrorCode.FINANCE_SUMMARY_QUERY_INVALID, 'from must not be after to'))
    }
    return this.db.finance_monthly_summary.findMany({
      where: { month: { gte: monthStart(from), lte: monthStart(to) } },
      orderBy: { month: 'asc' },
    })
  }

  // Cash basis: an expense counts in the month of incurred_on. Deleted expenses don't count.
  private async costsFor(month: string) {
    const groups = await this.db.expense.groupBy({
      by: ['category'],
      where: { deleted_at: null, incurred_on: { gte: monthStart(month), lt: monthStart(month, 1) } },
      _sum: { amount: true },
    })
    const costs: Pick<SummaryAmounts, CostColumn> = {
      maintenance_cost: '0.00',
      staff_cost: '0.00',
      catering_cost: '0.00',
      other_cost: '0.00',
    }
    for (const group of groups) {
      const column = COST_COLUMNS[group.category as ExpenseCategory] // the expense table only allows these 4 categories
      if (group._sum.amount) {
        costs[column] = group._sum.amount.toFixed(2)
      }
    }
    return costs
  }

  // TODO: revenue and refunds come from Features 5a / 5b (cash basis: the month the money moved), and pass-through from the
  // quote lines or 5a; this will then take the month. Until those teams agree the format, they are 0 so costs and profit
  // still work (guide, Step 4).
  private incomeFor(): Pick<SummaryAmounts, 'revenue_amount' | 'pass_through_amount' | 'refund_amount'> {
    return { revenue_amount: '0.00', pass_through_amount: '0.00', refund_amount: '0.00' }
  }
}

// profit = revenue − pass-through − refunds − maintenance − staff − catering − other. The table's CHECK demands this exactly,
// so it is computed in whole cents: float subtraction could be off by 0.01 and make the save fail.
export function profitOf(amounts: SummaryAmounts): string {
  const cents =
    toCents(amounts.revenue_amount) -
    toCents(amounts.pass_through_amount) -
    toCents(amounts.refund_amount) -
    toCents(amounts.maintenance_cost) -
    toCents(amounts.staff_cost) -
    toCents(amounts.catering_cost) -
    toCents(amounts.other_cost)
  return fromCents(cents)
}

// "250000.5" → 25000050n
function toCents(value: Numeric | string): bigint {
  const [whole, fraction = ''] = (typeof value === 'string' ? Number(value) : value).toFixed(2).split('.')
  const sign = whole.startsWith('-') ? -1n : 1n
  return sign * (BigInt(whole.replace('-', '')) * 100n + BigInt(fraction))
}

// 23500000n → "235000.00"
function fromCents(cents: bigint): string {
  const magnitude = cents < 0n ? -cents : cents
  return `${cents < 0n ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`
}
