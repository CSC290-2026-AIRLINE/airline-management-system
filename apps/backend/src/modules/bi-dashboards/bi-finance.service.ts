import { Injectable } from '@nestjs/common'
import { FinanceSummaryService } from '@backend/modules/pricing/finance/summary/finance-summary.service'
import { PaymentScheduleService } from '@backend/modules/pricing/finance/payment-schedule/payment-schedule.service'

/** A wide enough window to list every month Feature 4 has computed; `findRange` returns only months that exist. */
const FIRST_MONTH = '2000-01'
const LAST_MONTH = '2099-12'

type SummaryRow = Awaited<ReturnType<FinanceSummaryService['findRange']>>[number]
type ScheduleRow = Awaited<ReturnType<PaymentScheduleService['findAll']>>[number]

export interface FinanceRow {
  month: string
  revenue: number
  pass_through: number
  refund: number
  maintenance: number
  staff: number
  catering: number
  other: number
  profit: number
  computed_at: string
}

/** One month as the finance screen shows it. Costs and margin are derived here, from the stored lines. */
export interface BiFinanceMonth {
  month: string
  revenue: number
  pass_through: number
  refund: number
  maintenance: number
  staff: number
  catering: number
  other: number
  costs: number
  profit: number
  margin_pct: number | null
  computed_at: string
  /** True when the figures were computed before the month ended. */
  partial: boolean
}

export interface BiScheduledPayment {
  id: string
  category: string
  payee: string
  description: string | null
  amount: number
  due_date: string
  status: 'scheduled'
}

/**
 * Monthly finance, read through Feature 4's services (it owns and computes the figures). This service only reads.
 * Feature 4's summary has no route column, so finance is for the whole airline.
 */
@Injectable()
export class BiFinanceService {
  constructor(
    private readonly summaries: FinanceSummaryService,
    private readonly schedules: PaymentScheduleService,
  ) {}

  /**
   * The chosen month, the month before it for the change figures, and every computed month, oldest first. `month` is
   * `YYYY-MM`, or the latest computed month. A month Feature 4 has not computed yet comes back as null.
   */
  async forMonth(
    month: string | undefined,
  ): Promise<{ current: BiFinanceMonth | null; previous: BiFinanceMonth | null; months: string[] }> {
    const rows = (await this.summaries.findRange(FIRST_MONTH, LAST_MONTH)).map(fromSummary)
    const months = rows.map((r) => r.month)
    const chosen = month ?? months.at(-1) ?? null
    if (chosen === null) return { current: null, previous: null, months }

    const byMonth = new Map(rows.map((r) => [r.month, r]))
    const pick = (m: string) => {
      const row = byMonth.get(m)
      return row ? toMonth(row) : null
    }
    return { current: pick(chosen), previous: pick(previousMonth(chosen)), months }
  }

  /**
   * Every Feature 4 payment still scheduled and due from `today` (the simulation date), any category, in due-date order.
   * The date filter stays here because Feature 4's own "today" does not read the simulation clock yet.
   */
  async upcomingPayments(today: string): Promise<BiScheduledPayment[]> {
    const rows = await this.schedules.findAll({ status: 'scheduled' })
    return rows
      .map(fromSchedule)
      .filter((p) => p.due_date >= today)
      .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id))
  }
}

/** Feature 4's summary row (Decimals and Dates) as plain numbers and strings. */
export function fromSummary(row: SummaryRow): FinanceRow {
  return {
    month: row.month.toISOString().slice(0, 7),
    revenue: Number(row.revenue_amount),
    pass_through: Number(row.pass_through_amount),
    refund: Number(row.refund_amount),
    maintenance: Number(row.maintenance_cost),
    staff: Number(row.staff_cost),
    catering: Number(row.catering_cost),
    other: Number(row.other_cost),
    profit: Number(row.profit_amount),
    // Whole seconds, as the page has always received it.
    computed_at: row.computed_at.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
}

export function fromSchedule(row: ScheduleRow): BiScheduledPayment {
  return {
    id: row.id,
    category: row.category,
    payee: row.payee,
    description: row.description,
    amount: Number(row.amount),
    due_date: row.due_date.toISOString().slice(0, 10),
    status: 'scheduled',
  }
}

export function toMonth(row: FinanceRow): BiFinanceMonth {
  // Costs are the operating costs. Refunds and taxes are shown as their own lines, as the finance screen does.
  const costs = row.maintenance + row.staff + row.catering + row.other
  const partialBefore = nextMonthStart(row.month)
  return {
    month: row.month,
    revenue: row.revenue,
    pass_through: row.pass_through,
    refund: row.refund,
    maintenance: row.maintenance,
    staff: row.staff,
    catering: row.catering,
    other: row.other,
    costs,
    profit: row.profit,
    margin_pct: row.revenue > 0 ? row.profit / row.revenue : null,
    computed_at: row.computed_at,
    partial: row.computed_at < `${partialBefore}T00:00:00Z`,
  }
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 7)
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}
