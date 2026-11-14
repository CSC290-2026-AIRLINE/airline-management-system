import { EXPENSE_CATEGORIES, type ExpenseCategory, type FinanceSummary } from './finance-api'
import { AMOUNT, categoryLabel, monthLabel } from './finance-format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { CARD_BODY, CARD_TITLE } from '../components/card-styles'

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
    <Card aria-labelledby="cost-breakdown-title">
      <CardHeader>
        <CardTitle id="cost-breakdown-title" role="heading" aria-level={2} className={CARD_TITLE}>
          Cost breakdown · {monthLabel(month)}
        </CardTitle>
        <CardDescription>Share of this month’s costs, refunds excluded.</CardDescription>
      </CardHeader>
      <CardContent className={CARD_BODY}>
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
      </CardContent>
    </Card>
  )
}
