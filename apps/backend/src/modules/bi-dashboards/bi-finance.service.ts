import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

interface FinanceRow {
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

/**
 * Monthly finance from `finance_monthly_summary`, which Feature 4 owns and fills. This service only reads it.
 * The table has no route column, so finance is for the whole airline.
 */
@Injectable()
export class BiFinanceService {
  constructor(private readonly db: DbService) {}

  /** Months that have been computed, oldest first. */
  async months(): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ month: string }[]>`
      SELECT to_char(month, 'YYYY-MM') AS month FROM finance_monthly_summary ORDER BY month`
    return rows.map((r) => r.month)
  }

  /** The chosen month, and the month before it for the change figures. `month` is `YYYY-MM`, or the latest month. */
  async forMonth(
    month: string | undefined,
  ): Promise<{ current: BiFinanceMonth | null; previous: BiFinanceMonth | null; months: string[] }> {
    const months = await this.months()
    const chosen = month ?? months.at(-1) ?? null
    if (chosen === null) return { current: null, previous: null, months }

    const current = await this.row(chosen)
    const previous = await this.row(previousMonth(chosen))
    return { current, previous, months }
  }

  private async row(month: string): Promise<BiFinanceMonth | null> {
    const rows = await this.db.$queryRaw<FinanceRow[]>`
      SELECT
        to_char(month, 'YYYY-MM') AS month,
        revenue_amount::float8 AS revenue,
        pass_through_amount::float8 AS pass_through,
        refund_amount::float8 AS refund,
        maintenance_cost::float8 AS maintenance,
        staff_cost::float8 AS staff,
        catering_cost::float8 AS catering,
        other_cost::float8 AS other,
        profit_amount::float8 AS profit,
        to_char(computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at
      FROM finance_monthly_summary
      WHERE month = ${`${month}-01`}::date`
    return rows[0] ? toMonth(rows[0]) : null
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
