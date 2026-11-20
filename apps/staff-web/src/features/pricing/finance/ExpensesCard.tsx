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
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Card, CardContent, CardDescription, CardTitle } from '@staff-web/components/ui/card'
import { Notice } from '../components/Notice'
import { CARD_BODY, CARD_TITLE } from '../components/card-styles'

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
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load expenses: {expenses.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={expenses.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !expenses.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading expenses…</p>
  ) : list.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">No expenses in {monthLabel(month)}.</p>
  ) : (
    <>
      {/* Desktop: one table */}
      <div className={tableWrapClass}>
        <Table className="text-[13px] text-(--pr-primary)">
          <TableHeader className="[&_tr]:border-0">
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
    <Card aria-labelledby="expenses-card-title">
      <CardContent className={CARD_BODY}>
        <div className="flex flex-wrap items-start justify-between gap-3 max-[800px]:grid">
          <div className="grid gap-2">
            <CardTitle id="expenses-card-title" role="heading" aria-level={2} className={CARD_TITLE}>
              Expenses · {monthLabel(month)}
            </CardTitle>
            <CardDescription>Everything paid or incurred this month.</CardDescription>
          </div>
          <Button className={primaryButtonClass} onClick={() => setRecording(true)}>
            + Record expense
          </Button>
        </div>

        <Notice text={notice ?? undefined} />

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
      </CardContent>
    </Card>
  )
}
