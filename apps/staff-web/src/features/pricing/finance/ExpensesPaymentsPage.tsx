import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { usePricingApi } from '../api'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { useLoad } from '../hooks/useLoad'
import { CostCards } from './CostCards'
import { ExpensesCard } from './ExpensesCard'
import { useFinanceApi } from './finance-api'
import { monthLabel, todayKey } from './finance-format'
import { PaymentScheduleCard } from './PaymentScheduleCard'

const MONTHS_BACK = 12

export function ExpensesPaymentsPage() {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  return (
    <PricingShell title="Expenses & payments" description="Record what the airline spends and schedule what it still has to pay.">
      {isLoading ? (
        <p className="pr-state">Signing in…</p>
      ) : !accessToken ? (
        <div className="pr-callout is-error" role="alert">
          Your session could not be started. Sign out and sign in again.
        </div>
      ) : (
        <ExpensesPaymentsContent />
      )}
    </PricingShell>
  )
}

function ExpensesPaymentsContent() {
  const api = useFinanceApi()
  const pricingApi = usePricingApi()
  const months = recentMonths()
  const [month, setMonth] = useState(months[0].value)
  // Loaded here because the cost cards and the expenses table show the same month.
  const expenses = useLoad(() => api.listExpenses(month), `expenses:${month}`)
  const base = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const unit = base.data ?? ''

  return (
    <div className="pr-stack">
      <div className="grid w-60 gap-1.5 max-[800px]:w-full">
        <span id="month-label" className="text-(length:--pr-text-caption) font-semibold tracking-wide text-(--pr-muted) uppercase">
          Month
        </span>
        <Select
          items={Object.fromEntries(months.map((m) => [m.value, m.label]))}
          value={month}
          onValueChange={(value) => value && setMonth(value)}
        >
          <SelectTrigger
            aria-labelledby="month-label"
            className="h-10 w-full justify-between rounded-(--pr-radius-field) border-(--pr-border) bg-white text-(length:--pr-text-label) text-(--pr-ink)"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <CostCards unit={unit} expenses={expenses.data} />

      <ErrorBoundary>
        <ExpensesCard month={month} unit={unit} expenses={expenses} />
      </ErrorBoundary>
      <ErrorBoundary>
        {/* Paying a bill creates an expense, so the month's expenses and cost cards reload. */}
        <PaymentScheduleCard unit={unit} onPaid={expenses.reload} />
      </ErrorBoundary>
    </div>
  )
}

// This month ("Oct 2026 so far") and the 11 before it, newest first.
function recentMonths() {
  const [year, month] = todayKey().split('-').map(Number)
  return Array.from({ length: MONTHS_BACK }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1 - i, 1))
    const value = date.toISOString().slice(0, 7)
    return { value, label: i === 0 ? `${monthLabel(value)} so far` : monthLabel(value) }
  })
}
