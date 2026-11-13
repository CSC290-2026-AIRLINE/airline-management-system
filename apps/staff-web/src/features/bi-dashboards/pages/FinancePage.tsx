import { useState } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useBiApi, type BiFinanceMonth } from '../api/bi'
import { BiExportMenu } from '../components/BiFilters'
import { BiMonthPicker } from '../components/BiMonthPicker'
import { BiPageHeader } from '../components/BiPageHeader'
import { FinanceWaterfall, type WaterfallStep } from '../components/FinanceWaterfall'
import { BI_COLORS } from '../chart-colors'
import { ChartFrame } from '../components/InteractiveCharts'
import { KpiCard } from '../components/KpiCard'
import { useBiLoad } from '../hooks/useBiLoad'
import { comparison, relativeChange } from '../lib-comparison'
import { formatCount, formatDateTime, formatPercent, formatThb } from '../lib-format'

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

export function FinancePage() {
  const api = useBiApi()
  const [chosen, setChosen] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
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
    <>
      <BiPageHeader
        title="Financial report"
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
        action={
          <Button
            variant="outline"
            className="bi-button"
            disabled={!current}
            onClick={() => {
              setShowReport(true)
              window.setTimeout(() => document.getElementById('bi-report-lines')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
            }}
          >
            View report lines
          </Button>
        }
      />
      <div className="bi-page-content" aria-busy={finance.loading}>
        {(finance.error || exportError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {exportError || `Could not load the finance figures (${finance.error}).`}
              {finance.error && (
                <Button variant="outline" className="bi-button" onClick={finance.retry}>
                  Retry
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <Card className="bi-filter-card print:hidden">
          <div className="bi-filter-fields">
            <div className="bi-field bi-route-field">
              <Label htmlFor="bi-finance-route">Route</Label>
              <Select value="all">
                <SelectTrigger id="bi-finance-route">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All routes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bi-field">
              <Label htmlFor="bi-month">Month</Label>
              <BiMonthPicker id="bi-month" value={month} months={months} onChange={setChosen} />
            </div>
          </div>
          <BiExportMenu disabled={!current} onExportCsv={() => void exportCsv()} onPrint={() => window.print()} />
        </Card>
        {!finance.error && finance.data === null && (
          <>
            <div className="bi-kpis">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[124px] rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-[380px] rounded-xl" />
          </>
        )}
        {finance.data && !current && (
          <Card className="bi-empty">
            <h2>This month has not been computed yet</h2>
            <p>Once Pricing & Finance computes the monthly report, the figures will appear here.</p>
          </Card>
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
            <section aria-label="Finance headline figures" className="bi-kpis">
              <KpiCard
                label="Revenue"
                value={formatThb(current.revenue, true)}
                hint="Feature 4 monthly revenue"
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
              subtitle={`All routes · ${monthLabel(month)} · THB millions`}
              wide
              legend={[
                { label: 'Revenue', color: BI_COLORS.navy },
                { label: 'Taxes, surcharges and refunds', color: '#8fa4ca' },
                { label: 'Costs', color: BI_COLORS.blue },
                { label: 'Profit', color: BI_COLORS.green },
              ]}
            >
              <FinanceWaterfall steps={steps} />
            </ChartFrame>
            <div className="bi-finance-details">
              <Card className="bi-report-lines" id="bi-report-lines">
                <div className="bi-chart-heading">
                  <h2>Report lines</h2>
                  {showReport && <span>{monthLabel(month, true)} monthly report</span>}
                </div>
                <div className="bi-table-scroll">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">LINE</TableHead>
                        <TableHead scope="col" className="text-right">
                          AMOUNT (THB)
                        </TableHead>
                        <TableHead scope="col" className="text-right">
                          {suffix.toUpperCase()}
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
                            className={line.key === 'profit' ? 'bi-profit-row' : line.key === 'revenue' ? 'font-semibold' : ''}
                          >
                            <TableCell>{line.label}</TableCell>
                            <TableCell className="text-right">
                              {new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}
                            </TableCell>
                            <TableCell className={`text-right bi-trend-${trend(difference, line.deduct)}`}>
                              {difference === null ? '—' : `${difference >= 0 ? '+' : ''}${(difference * 100).toFixed(1)}%`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
              <Card className="bi-payments">
                <h2>Upcoming maintenance payments</h2>
                <p className="bi-payments-description">
                  Scheduled payments due from today.
                  <br />
                  Fleet-wide, not split by route.
                </p>
                {payments.error ? (
                  <div role="alert" className="bi-trend-bad">
                    <p>Could not load scheduled payments.</p>
                    <Button variant="outline" className="bi-button" onClick={payments.retry}>
                      Retry payments
                    </Button>
                  </div>
                ) : payments.data === null ? (
                  <Skeleton className="h-[240px]" />
                ) : payments.data.length === 0 ? (
                  <p className="bi-chart-empty">No upcoming maintenance payments.</p>
                ) : (
                  <>
                    <ul>
                      {payments.data.map((payment) => (
                        <li key={payment.id}>
                          <div>
                            <strong>{payment.payee}</strong>
                            <strong>{formatThb(payment.amount)}</strong>
                          </div>
                          <div>
                            <span>
                              {payment.description ? `${payment.description} · ` : ''}Due{' '}
                              {new Intl.DateTimeFormat('en-GB', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                timeZone: 'UTC',
                              }).format(new Date(`${payment.due_date}T00:00:00Z`))}
                            </span>
                            <span className="bi-scheduled">Scheduled</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="bi-payments-total">
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
        <p className="bi-footnote">
          Revenue here is counted by payment month (Feature 4); the operations dashboard counts by flight date, so the totals can differ.
          Profit is Feature 4’s figure and is not recalculated here. Financial summaries are fleet-wide.
        </p>
      </div>
    </>
  )
}
