import { EXPENSE_CATEGORIES, type Expense } from './finance-api'
import { AMOUNT, categoryLabel } from './finance-format'

interface CostCardsProps {
  unit: string // base currency code
  expenses?: Expense[] // the chosen month; undefined while loading
}

// One card per category plus the total, from the month's expenses (design: the row under the month picker).
export function CostCards({ unit, expenses }: CostCardsProps) {
  const totals = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0]))
  for (const expense of expenses ?? []) {
    totals[expense.category] += Number(expense.amount)
  }
  const total = Object.values(totals).reduce((sum, amount) => sum + amount, 0)
  const show = (amount: number) => (expenses ? AMOUNT.format(amount) : '—')

  return (
    <ul className="m-0 grid list-none grid-cols-5 gap-3 p-0 max-[1100px]:grid-cols-3 max-[800px]:grid-cols-2" aria-label="Costs this month">
      {EXPENSE_CATEGORIES.map((category) => (
        <li key={category} className="grid gap-0.5 rounded-(--pr-radius-card) border border-(--pr-border) bg-(--pr-surface) px-4 py-3.5">
          <span className="text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-muted) uppercase">
            {categoryLabel(category)}
          </span>
          <strong className="text-[26px] leading-tight text-(--pr-ink)">{show(totals[category])}</strong>
          <span className="text-(length:--pr-text-small) text-(--pr-muted)">{unit}</span>
        </li>
      ))}
      <li className="grid gap-0.5 rounded-(--pr-radius-card) bg-(--pr-primary) px-4 py-3.5 text-white max-[800px]:col-span-2">
        <span className="text-(length:--pr-text-caption) font-semibold tracking-wide uppercase opacity-80">Total</span>
        <strong className="text-[26px] leading-tight">{show(total)}</strong>
        <span className="text-(length:--pr-text-small) opacity-80">{unit}</span>
      </li>
    </ul>
  )
}
