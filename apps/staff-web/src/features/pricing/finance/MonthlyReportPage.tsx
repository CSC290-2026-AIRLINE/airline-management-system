import { useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import { errorMessage, usePricingApi } from '../api'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { PricingShell } from '../components/PricingShell'
import { useLoad } from '../hooks/useLoad'
import { CostBreakdownCard } from './CostBreakdownCard'
import { useFinanceApi } from './finance-api'
import { dateTime, monthLabel, shiftMonth, todayKey } from './finance-format'
import { primaryButtonClass } from './finance-styles'
import { MonthsCard } from './MonthsCard'
import { StillToPayCard } from './StillToPayCard'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'

const MONTHS_SHOWN = 5 // this month and the 4 before it, like the design (Jun–Oct)
const TITLE = 'Monthly report'
const DESCRIPTION = 'Revenue, refunds and costs for each month, with the resulting profit.'
const MONTH_NAME = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const SHORT_MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function MonthlyReportPage() {
  // Wait for the session exchange so the first API calls carry a token instead of racing the refresh.
  const { isLoading, accessToken } = useAppAuth()

  if (isLoading || !accessToken) {
    return (
      <PricingShell title={TITLE} description={DESCRIPTION}>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Signing in…</p>
        ) : (
          <Alert variant="destructive">
            <AlertDescription className="block">Your session could not be started. Sign out and sign in again.</AlertDescription>
          </Alert>
        )}
      </PricingShell>
    )
  }
  return <MonthlyReport />
}

function MonthlyReport() {
  const api = useFinanceApi()
  const pricingApi = usePricingApi()
  const today = todayKey()
  const current = today.slice(0, 7)
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftMonth(current, i - MONTHS_SHOWN + 1))
  const [from, to] = [months[0], months[months.length - 1]]

  const summaries = useLoad(() => api.listSummaries(from, to), `summaries:${from}:${to}`)
  const schedules = useLoad(() => api.listPaymentSchedules(), 'payment-schedules')
  const base = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const unit = base.data ?? ''
  const [recomputing, setRecomputing] = useState(false)
  const [recomputedAt, setRecomputedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One call rebuilds every month shown.
  async function recompute() {
    setRecomputing(true)
    setError(null)
    try {
      await api.recomputeSummaries(from, to)
      setRecomputedAt(new Date())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRecomputing(false)
      summaries.reload()
      schedules.reload()
    }
  }

  // TODO: say "(simulated 6 Oct 2026)" like the design once Core exposes the simulated date; this is the real one.
  const lastComputed = (summaries.data ?? [])
    .map((row) => row.computed_at)
    .sort()
    .at(-1)
  const status = recomputedAt
    ? { tone: 'good' as const, text: `Recomputed just now for ${rangeLabel(from, to)} · ${dateTime(recomputedAt)}` }
    : lastComputed
      ? { tone: 'muted' as const, text: `Last computed ${dateTime(lastComputed)}.` }
      : { tone: 'muted' as const, text: 'Not computed yet. Press Recompute summary.' }
  const footnote = `* ${MONTH_NAME.format(new Date(`${current}-01`))} is a partial month (to ${DAY_MONTH.format(new Date())}). All amounts in ${unit}.`
  const currentRow = summaries.data?.find((row) => row.month.slice(0, 7) === current)

  return (
    <PricingShell
      title={TITLE}
      description={DESCRIPTION}
      actions={
        <Button className={`${primaryButtonClass} max-[800px]:w-full`} disabled={recomputing} onClick={() => void recompute()}>
          {recomputing ? 'Recomputing…' : 'Recompute summary'}
        </Button>
      }
    >
      <div className="pr-stack">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="block">Could not recompute: {error}</AlertDescription>
          </Alert>
        )}

        <ErrorBoundary>
          <MonthsCard
            months={months}
            current={current}
            rows={summaries.data}
            error={summaries.error}
            status={status}
            footnote={footnote}
            unit={unit}
            onRetry={summaries.reload}
          />
        </ErrorBoundary>

        <div className="grid grid-cols-[minmax(0,597fr)_minmax(0,380fr)] items-start gap-5 max-[1100px]:grid-cols-1">
          <ErrorBoundary>
            <CostBreakdownCard month={current} summary={currentRow} unit={unit} />
          </ErrorBoundary>
          <ErrorBoundary>
            <StillToPayCard month={current} schedules={schedules.data} error={schedules.error} unit={unit} onRetry={schedules.reload} />
          </ErrorBoundary>
        </div>

        <p className="m-0 rounded-[10px] border border-[#102544] bg-[#fff1c7] px-4 py-3.5 text-[13px] text-[#102544]">
          Dashboards and exports belong to Feature 14. This page only recomputes and shows the monthly summary.
        </p>
      </div>
    </PricingShell>
  )
}

// "Jun to Oct 2026", or "Nov 2025 to Mar 2026" across a year.
function rangeLabel(from: string, to: string) {
  const start = from.slice(0, 4) === to.slice(0, 4) ? SHORT_MONTH.format(new Date(`${from}-01`)) : monthLabel(from)
  return `${start} to ${monthLabel(to)}`
}
