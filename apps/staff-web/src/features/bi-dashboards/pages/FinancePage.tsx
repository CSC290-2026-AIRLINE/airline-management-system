import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Badge } from '@staff-web/components/ui/badge'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { useBiApi, type BiFinanceMonth } from '../api/bi'
import { BiExportMenu, BiFilterCard, FilterField } from '../components/BiFilters'
import { BiMonthPicker } from '../components/BiMonthPicker'
import { BiPageFrame } from '../components/BiPageFrame'
import { SectionEmpty, SectionLoading } from '../components/BiSectionState'
import { FinanceWaterfall, type WaterfallStep } from '../components/FinanceWaterfall'
import { BI_COLORS } from '../chart-colors'
import { ChartFrame, ChartHeading } from '../components/InteractiveCharts'
import { KpiCard } from '../components/KpiCard'
import { useBiLoad } from '../hooks/useBiLoad'
import { comparison, relativeChange } from '../lib-comparison'
import { formatCount, formatDateTime, formatPercent, formatThb } from '../lib-format'
import { CARD, CARD_TITLE, EMPTY_TEXT, KPI_GRID, trendClass } from '../lib-styles'

function monthLabel(month: string, long = false): string {
  return new Intl.DateTimeFormat('en-GB', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`))
    .replace('Sept ', 'Sep ')
}
const LINES: { label: string; key: keyof BiFinanceMonth; deduct: boolean }[] = [
  { label: 'Revenue', key: 'revenue', deduct: false },
  { label: 'Taxes and surcharges collected for others', key: 'pass_through', deduct: true },
  { label: 'Refunds', key: 'refund', deduct: true },
  { label: 'Maintenance', key: 'maintenance', deduct: true },
  { label: 'Staff', key: 'staff', deduct: true },
  { label: 'Meal and catering', key: 'catering', deduct: true },
  { label: 'Other expenses', key: 'other', deduct: true },
  { label: 'Profit', key: 'profit', deduct: false },
]
/** Feature 4's payment schedule categories, as the report lines name them. */
const CATEGORY_LABELS: Record<string, string> = {
  maintenance: 'Maintenance',
  staff: 'Staff',
  catering: 'Meal and catering',
  other: 'Other',
}

export function FinancePage() {
  const api = useBiApi()
  // The report is monthly: the chosen month loads as soon as it is picked. Empty means the latest computed month.
  const [chosen, setChosen] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const finance = useBiLoad(`finance|${chosen ?? ''}`, () => api.getFinance(chosen))
  const payments = useBiLoad('finance-payments', () => api.getFinancePayments())
  const current = finance.data?.current ?? null
  const previous = finance.data?.previous ?? null
  const months = finance.data?.months ?? finance.previousData?.months ?? []
  const month = chosen ?? current?.month ?? finance.previousData?.current?.month ?? ''
  const suffix = previous ? `vs ${monthLabel(previous.month).split(' ')[0]}` : 'vs last month'
  const delta = (key: keyof BiFinanceMonth) =>
    current ? relativeChange(current[key] as number, previous?.[key] as number | undefined) : null
  const trend = (value: number | null, lowerIsBetter = false) =>
    value === null || value === 0 ? ('neutral' as const) : value > 0 !== lowerIsBetter ? ('good' as const) : ('bad' as const)
  const steps: WaterfallStep[] = current
    ? [
        { label: 'Revenue', value: current.revenue, total: true },
        { label: 'Taxes & surcharges', value: -current.pass_through },
        { label: 'Refunds', value: -current.refund },
        { label: 'Maintenance', value: -current.maintenance },
        { label: 'Staff', value: -current.staff },
        { label: 'Meal & catering', value: -current.catering },
        { label: 'Other expenses', value: -current.other },
        { label: 'Profit', value: current.profit, total: true },
      ]
    : []
  const totalScheduled = payments.data?.reduce((sum, row) => sum + row.amount, 0) ?? 0
  async function exportCsv() {
    setExportError(null)
    try {
      await api.downloadCsv(`/api/bi/export/finance.csv?month=${month}`, `finance-${month}.csv`)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Please try again.')
    }
  }

  return (
    <BiPageFrame
      title="Business intelligence"
      description="Monthly revenue, costs and profit from the Pricing & Finance monthly report. Read only."
      status={
        finance.loading
          ? 'Loading figures…'
          : finance.error
            ? 'Figures unavailable'
            : current
              ? `Figures computed ${formatDateTime(current.computed_at)}`
              : 'Figures not computed yet'
      }
      tone={finance.loading ? 'pending' : finance.error ? 'error' : current ? 'ok' : 'warning'}
      busy={finance.loading}
      filters={
        <BiFilterCard
          note="Pricing & Finance keeps whole months for the whole airline, so this report is picked by month, not by route or dates."
          fields={
            <FilterField label="Month" htmlFor="bi-month">
              <BiMonthPicker id="bi-month" value={month} months={months} onChange={setChosen} />
            </FilterField>
          }
          actions={<BiExportMenu disabled={!current} onExportCsv={() => void exportCsv()} onPrint={() => window.print()} />}
        />
      }
      alerts={
        (finance.error || exportError) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="flex flex-col items-start gap-3">
              {exportError || `Could not load the finance figures (${finance.error}).`}
              {finance.error && (
                <Button variant="outline" size="sm" onClick={finance.retry}>
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )
      }
    >
      {!finance.error && finance.data === null && (
        <>
          <div className={KPI_GRID}>
            {Array.from({ length: 4 }, (_, i) => (
              <SectionLoading key={i} className="h-[124px]" />
            ))}
          </div>
          <SectionLoading className="h-[380px]" />
        </>
      )}
      {finance.data && !current && (
        <SectionEmpty
          title="This month has not been computed yet"
          description="Pricing & Finance computes these figures. Recompute the month on its Monthly report page, then come back here."
          action={
            <Button variant="outline" asChild>
              <Link to="/pricing/monthly-report">Open Monthly report</Link>
            </Button>
          }
        />
      )}
      {current && (
        <>
          {current.partial && (
            <Alert>
              <AlertDescription>
                Partial month. Figures computed {formatDateTime(current.computed_at)} may change as the month closes.
              </AlertDescription>
            </Alert>
          )}
          <section aria-label="Finance headline figures" className={KPI_GRID}>
            <KpiCard
              label="Revenue"
              value={formatThb(current.revenue, true)}
              hint="Money received this month"
              comparison={comparison(delta('revenue'), '%', suffix)}
              trend={trend(delta('revenue'))}
            />
            <KpiCard
              label="Costs"
              value={formatThb(current.costs, true)}
              hint="Maintenance, staff, catering, other"
              comparison={comparison(delta('costs'), '%', suffix)}
              trend={trend(delta('costs'), true)}
            />
            <KpiCard
              label="Profit"
              value={formatThb(current.profit, true)}
              hint="After taxes for others and refunds"
              comparison={comparison(delta('profit'), '%', suffix)}
              trend={trend(delta('profit'))}
            />
            <KpiCard
              label="Profit margin"
              value={formatPercent(current.margin_pct)}
              hint="Profit ÷ revenue"
              comparison={comparison(
                current.margin_pct !== null && previous?.margin_pct != null ? current.margin_pct - previous.margin_pct : null,
                'pts',
                suffix,
              )}
              trend={trend(current.margin_pct !== null && previous?.margin_pct != null ? current.margin_pct - previous.margin_pct : null)}
            />
          </section>
          <ChartFrame
            title="From revenue to profit"
            subtitle={`All routes · ${monthLabel(month)} · THB`}
            legend={[
              { label: 'Revenue', color: BI_COLORS.navy },
              { label: 'Taxes, surcharges and refunds', color: '#8fa4ca' },
              { label: 'Costs', color: BI_COLORS.blue },
              { label: 'Profit', color: BI_COLORS.green },
            ]}
          >
            <FinanceWaterfall steps={steps} />
          </ChartFrame>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,690fr)_minmax(0,350fr)]">
            <Card className={CARD}>
              <ChartHeading title="Report lines" subtitle={`${monthLabel(month, true)} monthly report`} />
              {/* On a phone the line names wrap, so the amount and change columns stay on screen. */}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Line</TableHead>
                    <TableHead scope="col" className="text-right">
                      Amount (THB)
                    </TableHead>
                    <TableHead scope="col" className="text-right whitespace-normal">
                      Change {suffix}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {LINES.map((line) => {
                    const value = current[line.key] as number
                    const difference = delta(line.key)
                    return (
                      <TableRow
                        key={line.key}
                        className={cn(
                          'hover:bg-transparent',
                          line.key === 'profit' && 'border-t-2 border-t-muted-foreground/40 font-semibold',
                          line.key === 'revenue' && 'font-semibold',
                        )}
                      >
                        <TableCell className="whitespace-normal">{line.label}</TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}
                        </TableCell>
                        <TableCell className={cn('text-right', trendClass(trend(difference, line.deduct)))}>
                          {difference === null ? '—' : `${difference >= 0 ? '+' : ''}${(difference * 100).toFixed(1)}%`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
            <Card className={cn(CARD, 'lg:h-full')}>
              <div className="flex flex-col gap-1">
                <h2 className={CARD_TITLE}>Upcoming payments</h2>
                <p className="text-xs text-muted-foreground">Scheduled payments due from today.</p>
              </div>
              {payments.error ? (
                <div role="alert" className="flex flex-col items-start gap-3 text-sm text-destructive">
                  <p>Could not load scheduled payments.</p>
                  <Button variant="outline" size="sm" onClick={payments.retry}>
                    Retry payments
                  </Button>
                </div>
              ) : payments.data === null ? (
                <SectionLoading className="h-[240px]" />
              ) : payments.data.length === 0 ? (
                <p className={EMPTY_TEXT}>No upcoming payments.</p>
              ) : (
                <>
                  {/* Beside the report card, the list scrolls inside that card's height; stacked, it shows in full. */}
                  <ul className="m-0 list-none p-0 lg:min-h-0 lg:flex-1 lg:basis-0 lg:overflow-y-auto lg:pr-1.5">
                    {payments.data.map((payment) => (
                      <li key={payment.id} className="flex flex-col gap-1 border-b border-line py-2.5">
                        <div className="flex items-baseline justify-between gap-2 text-[13px] font-semibold">
                          <span>{payment.payee}</span>
                          <span>{formatThb(payment.amount)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0">
                            {CATEGORY_LABELS[payment.category] ?? payment.category} ·{' '}
                            {payment.description ? `${payment.description} · ` : ''}Due{' '}
                            {new Intl.DateTimeFormat('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              timeZone: 'UTC',
                            }).format(new Date(`${payment.due_date}T00:00:00Z`))}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-[11px]">
                            Scheduled
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between gap-2 pt-2 text-[13px] font-semibold">
                    <strong>Total scheduled</strong>
                    <strong>{formatThb(totalScheduled)}</strong>
                  </div>
                  <span className="sr-only">{formatCount(payments.data.length)} scheduled payments</span>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </BiPageFrame>
  )
}
