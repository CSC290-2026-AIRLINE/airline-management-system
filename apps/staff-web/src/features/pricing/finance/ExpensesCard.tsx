import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { Expense } from './finance-api'
import { AMOUNT, categoryLabel, fullDate, monthLabel } from './finance-format'
import {
  cellClass,
  headClass,
  headRowClass,
  phoneItemClass,
  phoneListClass,
  primaryButtonClass,
  rowClass,
  tableWrapClass,
  totalRowClass,
} from './finance-styles'
import { RecordExpenseDialog } from './RecordExpenseDialog'

const NOTICE_MS = 3000

interface ExpensesCardProps {
  month: string // YYYY-MM
  unit: string // base currency code
  expenses: { data?: Expense[]; error?: string; reload: () => void }
}

// Everything paid or incurred in the month (design: Expenses & payments → Expenses).
export function ExpensesCard({ month, unit, expenses }: ExpensesCardProps) {
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Newest first, like the design (the API returns them oldest first).
  const list = [...(expenses.data ?? [])].reverse()
  const total = list.reduce((sum, expense) => sum + Number(expense.amount), 0)

  const body = expenses.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load expenses: {expenses.error}{' '}
      <button type="button" className="pr-link-button" onClick={expenses.reload}>
        Retry
      </button>
    </div>
  ) : !expenses.data ? (
    <p className="pr-state">Loading expenses…</p>
  ) : list.length === 0 ? (
    <p className="pr-state">No expenses in {monthLabel(month)}.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className={tableWrapClass}>
        <Table className="text-(length:--pr-text-body)">
          <TableHeader className="bg-(--pr-head)">
            <TableRow className={headRowClass}>
              <TableHead className={headClass}>Date</TableHead>
              <TableHead className={headClass}>Category</TableHead>
              <TableHead className={headClass}>Description</TableHead>
              <TableHead className={headClass}>Amount ({unit})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((expense) => (
              <TableRow key={expense.id} className={rowClass}>
                <TableCell className={cellClass}>{fullDate(expense.incurred_on)}</TableCell>
                <TableCell className={cellClass}>{categoryLabel(expense.category)}</TableCell>
                <TableCell className={`${cellClass} whitespace-normal`}>{expense.description}</TableCell>
                <TableCell className={`${cellClass} font-semibold text-(--pr-ink)`}>{AMOUNT.format(Number(expense.amount))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Phone: one card per expense */}
      <ul className={phoneListClass}>
        {list.map((expense) => (
          <li key={expense.id} className={phoneItemClass}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-(length:--pr-text-small) text-(--pr-muted)">
                {fullDate(expense.incurred_on)} · {categoryLabel(expense.category)}
              </span>
              <strong className="text-(length:--pr-text-label) whitespace-nowrap text-(--pr-ink)">
                {AMOUNT.format(Number(expense.amount))}
              </strong>
            </div>
            <strong className="text-(length:--pr-text-label) text-(--pr-ink)">{expense.description}</strong>
          </li>
        ))}
      </ul>

      <div className={totalRowClass}>
        <span>Total this month</span>
        <span>
          {AMOUNT.format(total)} {unit}
        </span>
      </div>
    </>
  )

  return (
    <section className="pr-card" aria-labelledby="expenses-card-title">
      <div className="flex flex-wrap items-start justify-between gap-3 max-[800px]:grid">
        <div className="pr-card-head">
          <h2 id="expenses-card-title" className="pr-card-title">
            Expenses · {monthLabel(month)}
          </h2>
          <p className="pr-muted">Everything paid or incurred this month.</p>
        </div>
        <Button className={primaryButtonClass} onClick={() => setRecording(true)}>
          + Record expense
        </Button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="m-0 rounded-(--pr-radius-lg) bg-(--pr-good-bg) px-4 py-2.5 text-(length:--pr-text-body) font-semibold text-(--pr-good) empty:hidden"
      >
        {notice}
      </p>

      {body}

      <RecordExpenseDialog
        open={recording}
        unit={unit}
        onOpenChange={setRecording}
        onRecorded={(expense) => {
          setRecording(false)
          // An expense dated in another month is saved but won't show in this list, so say where it went.
          const expenseMonth = expense.incurred_on.slice(0, 7)
          setNotice(expenseMonth === month ? 'Expense recorded' : `Expense recorded in ${monthLabel(expenseMonth)}`)
          expenses.reload()
        }}
      />
    </section>
  )
}
