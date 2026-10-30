import { EXPENSE_CATEGORIES, type ExpenseCategory, type FinanceSummary } from './finance-api'
import { AMOUNT, categoryLabel, monthLabel } from './finance-format'

const COST_COLUMN: Record<ExpenseCategory, keyof FinanceSummary> = {
  maintenance: 'maintenance_cost',
  staff: 'staff_cost',
  catering: 'catering_cost',
  other: 'other_cost',
}

interface CostBreakdownCardProps {
  month: string // YYYY-MM
  summary?: FinanceSummary // that month's row; undefined if it was never recomputed
  unit: string
}

// Share of the month's costs per category (design: Monthly report → Cost breakdown).
export function CostBreakdownCard({ month, summary, unit }: CostBreakdownCardProps) {
  const costs = EXPENSE_CATEGORIES.map((category) => ({ category, amount: summary ? Number(summary[COST_COLUMN[category]]) : 0 }))
  const total = costs.reduce((sum, cost) => sum + cost.amount, 0)

  return (
    <section className="pr-card" aria-labelledby="cost-breakdown-title">
      <div className="pr-card-head">
        <h2 id="cost-breakdown-title" className="pr-card-title">
          Cost breakdown · {monthLabel(month)}
        </h2>
        <p className="pr-muted">Share of this month’s costs, refunds excluded.</p>
      </div>

      <ul className="m-0 grid list-none gap-4 p-0">
        {costs.map(({ category, amount }) => {
          const share = total > 0 ? Math.round((amount / total) * 100) : 0
          return (
            <li key={category} className="grid gap-1.5 text-[#102544]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{categoryLabel(category)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[13px]">
                    {AMOUNT.format(amount)} {unit}
                  </span>
                  <span className="text-(length:--pr-text-small) font-semibold text-(--pr-muted)">{share}%</span>
                </span>
              </div>
              <div
                className="h-2.5 rounded-[5px] bg-(--pr-head)"
                role="meter"
                aria-label={`${categoryLabel(category)} share`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={share}
              >
                <div className="h-2.5 rounded-[5px] bg-[#102544]" style={{ width: `${share}%` }} />
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between rounded-(--pr-radius-lg) bg-(--pr-head) px-3.5 py-2 text-[#102544]">
        <span className="text-[13px] font-semibold">Total costs</span>
        <span className="text-[14px] font-extrabold">
          {AMOUNT.format(total)} {unit}
        </span>
      </div>
    </section>
  )
}
