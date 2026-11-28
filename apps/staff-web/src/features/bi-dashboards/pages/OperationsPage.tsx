import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { filterQuery, useBiApi, type BiCabin, type BiFilters } from '../api/bi'
import { BiFilters as FilterBar } from '../components/BiFilters'
import { BiPageFrame } from '../components/BiPageFrame'
import { SectionEmpty, SectionError, SectionLoading } from '../components/BiSectionState'
import { DrillPanel } from '../components/DrillPanel'
import { BookingDrillPanel } from '../components/BookingDrillPanel'
import { KpiCard } from '../components/KpiCard'
import { BI_COLORS } from '../chart-colors'
import { CabinChart, ChartHeading, OnTimeChart, PeriodBarChart } from '../components/InteractiveCharts'
import { BiErrorBoundary } from '../components/BiErrorBoundary'
import { useBiDashboard } from '../hooks/useBiDashboard'
import { useBiLoad } from '../hooks/useBiLoad'
import { useSimulationDefaults } from '../hooks/useSimulationDefaults'
import { periodEnd } from '../lib-period'
import { comparison, defaultFilters, previousFilters, relativeChange } from '../lib-comparison'
import { dataAsOf, formatCompact, formatCount, formatPercent, formatThb } from '../lib-format'
import { CARD, CHART_GRID, EMPTY_TEXT, FOOTNOTE, KPI_GRID, TOOLTIP } from '../lib-styles'

type Drill = { title: string; description: string; filters: BiFilters; kind: 'period' | 'cabin' | 'cause' | 'bookings' } | null
const CAUSE_COLORS = [BI_COLORS.navy, BI_COLORS.blue, BI_COLORS.teal, '#8a94a6', BI_COLORS.yellow, '#b7bfcf', BI_COLORS.red]
/** The operations dashboard. Mounted only for roles with `f14.operations`, so its requests never run for anyone else. */
export function OperationsView() {
  // The filter bar edits a draft; the dashboard loads the applied filters, which change only when Apply is clicked.
  const [draft, setDraft] = useState<BiFilters>(defaultFilters)
  const [filters, setFilters] = useState<BiFilters>(defaultFilters)
  const [drill, setDrill] = useState<Drill>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const api = useBiApi()
  const { data, previousData, loading, error, refresh, refreshing, refreshError, retry } = useBiDashboard(filters)
  const status = data?.status ?? previousData?.status
  const latest = status?.latest_success ?? null
  const lastRun = status?.last_run ?? null
  useSimulationDefaults(status?.simulation_now, filters, (next) => {
    setDraft(next)
    setFilters(next)
  })
  const kpis = data?.kpis.kpis ?? null
  const isRefreshing = refreshing || status?.refreshing === true
  const runKey = latest?.id ?? 'none'
  const key = (name: string) => `${name}|${filterQuery(filters)}|${runKey}`
  const badDates = Boolean(filters.from && filters.to && filters.from > filters.to)
  const series = useBiLoad(key('series'), () => (badDates ? Promise.resolve([]) : api.getSeries(filters)))
  const cabins = useBiLoad(key('cabins'), () => (badDates ? Promise.resolve([]) : api.getCabins(filters)))
  const causes = useBiLoad(key('causes'), () => (badDates ? Promise.resolve([]) : api.getDelayCauses(filters)))
  const bookings = useBiLoad(key('bookings'), () => (badDates ? Promise.resolve([]) : api.getBookingsSeries(filters)))
  const before = previousFilters(filters)
  const previous = useBiLoad(`previous|${before ? filterQuery(before) : 'none'}|${runKey}`, async () => {
    if (!before) return null
    const [metrics, cabins, bookings] = await Promise.all([api.getKpis(before), api.getCabins(before), api.getBookingsSeries(before)])
    return { metrics: metrics.kpis, cabins, bookings }
  })
  const previousKpis = !previous.loading && !previous.error ? previous.data?.metrics : undefined
  const bookingSum = bookings.data?.reduce(
    (total, row) => ({ bookings: total.bookings + row.bookings, cancellations: total.cancellations + row.cancellations }),
    { bookings: 0, cancellations: 0 },
  )
  const previousBookingSum =
    !previous.loading && !previous.error
      ? previous.data?.bookings.reduce((total, row) => total + row.bookings - row.cancellations, 0)
      : undefined
  const netBookingsChange = bookingSum ? relativeChange(bookingSum.bookings - bookingSum.cancellations, previousBookingSum) : null
  const onTimeChange = kpis?.on_time_pct != null && previousKpis?.on_time_pct != null ? kpis.on_time_pct - previousKpis.on_time_pct : null
  const loadChange = kpis?.load_factor != null && previousKpis?.load_factor != null ? kpis.load_factor - previousKpis.load_factor : null
  const revenueChange =
    kpis?.revenue_per_seat != null && previousKpis?.revenue_per_seat != null
      ? relativeChange(kpis.revenue_per_seat, previousKpis.revenue_per_seat)
      : null
  const chartError = series.error || cabins.error || bookings.error || causes.error
  // Booking dates can precede every flight in the selection; those sales must remain visible.
  const empty = !loading && kpis?.flight_count === 0 && bookingSum?.bookings === 0 && bookingSum.cancellations === 0

  function changeFilters(next: BiFilters) {
    setFilters(next)
    setDrill(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function drillPeriod(period: string, metric = 'Flights') {
    const end = periodEnd(period, filters.group)
    const from = period < filters.from ? filters.from : period
    const to = filters.to && end > filters.to ? filters.to : end
    const bookingDates = metric === 'Bookings and cancellations'
    setDrill({
      kind: bookingDates ? 'bookings' : 'period',
      title: `${metric} · ${period}`,
      description: bookingDates
        ? `Bookings and cancellations from ${from} to ${to}, by booking date.`
        : `Flights from ${from} to ${to}, including cancellations. Longest delay first.`,
      filters: {
        ...filters,
        departedOnly: false,
        from,
        to,
      },
    })
  }
  function drillCabin(cabin: string, label: string) {
    setDrill({
      kind: 'cabin',
      title: `${label} load factor`,
      description: `Departed flights that sold ${label} seats.`,
      filters: { ...filters, cabin: cabin as BiCabin },
    })
  }
  function drillCause(cause: string) {
    setDrill({
      kind: 'cause',
      title: `Delay cause: ${cause.replaceAll('_', ' ')}`,
      description: 'Flights with at least one announced delay from this cause.',
      filters: { ...filters, cause },
    })
  }
  async function exportCsv() {
    setExportError(null)
    try {
      await api.downloadCsv(`/api/bi/export/metrics.csv?${filterQuery(filters)}`, 'metrics.csv')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Please try again.')
    }
  }

  function retryReads() {
    retry()
    series.retry()
    cabins.retry()
    causes.retry()
    bookings.retry()
    previous.retry()
  }

  return (
    <BiPageFrame
      title="Business intelligence"
      description="On-time performance, load factor, revenue per seat and bookings by route and date. Read only."
      status={dataAsOf(latest)}
      tone={latest ? undefined : 'warning'}
      refresh={{
        onRefresh: () => void refresh(),
        refreshing: isRefreshing,
        error: refreshError,
        lastRunFailed: lastRun?.status === 'failed',
      }}
      busy={loading}
      filters={
        <FilterBar
          filters={draft}
          routes={data?.routes ?? previousData?.routes ?? []}
          onChange={setDraft}
          onApply={() => changeFilters(draft)}
          onExportCsv={() => void exportCsv()}
          onPrint={() => window.print()}
          exportDisabled={badDates || empty}
        />
      }
      alerts={
        (error || exportError || chartError) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="flex flex-col items-start gap-3">
              {error || exportError || `Could not load chart data (${chartError}).`}
              {(error || chartError) && (
                <Button variant="outline" size="sm" onClick={retryReads}>
                  Retry figures
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )
      }
    >
      {badDates ? (
        <Alert variant="destructive">
          <AlertTitle>Check the dates</AlertTitle>
          <AlertDescription>The From date is after the To date. Change one of the dates to see the dashboard.</AlertDescription>
        </Alert>
      ) : empty ? (
        <SectionEmpty
          title="No flights for this route and dates"
          description="Try another route or a wider date range."
          action={
            <Button variant="outline" onClick={() => changeFilters({ ...filters, routeId: '', from: '', to: '' })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <BiErrorBoundary label="Headline figures">
            <section aria-label="Headline figures" className={KPI_GRID}>
              {kpis ? (
                <>
                  <KpiCard
                    label="On-time performance"
                    value={formatPercent(kpis.on_time_pct)}
                    hint="Left within 15 min"
                    comparison={comparison(onTimeChange, 'pts')}
                    trend={onTimeChange === null ? 'neutral' : onTimeChange >= 0 ? 'good' : 'bad'}
                  />
                  <KpiCard
                    label="Load factor"
                    value={formatPercent(kpis.load_factor)}
                    hint="Seats sold ÷ seats available"
                    comparison={comparison(loadChange, 'pts')}
                    trend={loadChange === null ? 'neutral' : loadChange >= 0 ? 'good' : 'bad'}
                  />
                  <KpiCard
                    label="Revenue per seat"
                    value={formatThb(kpis.revenue_per_seat)}
                    hint={filters.revenueMode === 'after_refunds' ? 'After refunds' : 'Before refunds'}
                    comparison={comparison(revenueChange)}
                    trend={revenueChange === null ? 'neutral' : revenueChange >= 0 ? 'good' : 'bad'}
                  />
                  <KpiCard
                    label="Bookings / cancellations"
                    value={bookingSum ? `${formatCompact(bookingSum.bookings)} / ${formatCompact(bookingSum.cancellations)}` : '—'}
                    hint={
                      bookingSum
                        ? `Net ${formatCount(bookingSum.bookings - bookingSum.cancellations)} · Cancel rate ${formatPercent(bookingSum.bookings > 0 ? bookingSum.cancellations / bookingSum.bookings : null)}`
                        : 'By booking date'
                    }
                    comparison={comparison(netBookingsChange)}
                  />
                </>
              ) : error ? (
                <div className="col-span-full">
                  <SectionError label="Headline figures" onRetry={retry} />
                </div>
              ) : (
                Array.from({ length: 4 }, (_, index) => <SectionLoading key={index} className="h-[124px]" />)
              )}
            </section>
          </BiErrorBoundary>
          <BiErrorBoundary label="Charts">
            <section aria-label="Operations charts" className={CHART_GRID}>
              {series.data ? (
                <OnTimeChart rows={series.data} group={filters.group} onPick={(period) => drillPeriod(period, 'On-time performance')} />
              ) : series.error ? (
                <SectionError label="On-time performance" onRetry={series.retry} />
              ) : (
                <SectionLoading />
              )}
              {cabins.data ? (
                <CabinChart
                  rows={cabins.data}
                  previous={!previous.loading && !previous.error ? (previous.data?.cabins ?? []) : []}
                  onPick={drillCabin}
                />
              ) : cabins.error ? (
                <SectionError label="Load factor by cabin" onRetry={cabins.retry} />
              ) : (
                <SectionLoading />
              )}
              {series.data ? (
                <PeriodBarChart
                  kind="revenue"
                  rows={series.data}
                  bookings={[]}
                  group={filters.group}
                  mode={filters.revenueMode}
                  onModeChange={(revenueMode) => changeFilters({ ...filters, revenueMode })}
                  onPick={(period) => drillPeriod(period, 'Revenue per seat')}
                />
              ) : series.error ? (
                <SectionError label="Revenue per seat" onRetry={series.retry} />
              ) : (
                <SectionLoading />
              )}
              {bookings.data ? (
                <PeriodBarChart
                  kind="bookings"
                  rows={[]}
                  bookings={bookings.data}
                  group={filters.group}
                  mode={filters.revenueMode}
                  onModeChange={() => {}}
                  onPick={(period) => drillPeriod(period, 'Bookings and cancellations')}
                />
              ) : bookings.error ? (
                <SectionError label="Bookings vs cancellations" onRetry={bookings.retry} />
              ) : (
                <SectionLoading />
              )}
            </section>
          </BiErrorBoundary>
          {drill && drill.kind !== 'cause' && (
            <BiErrorBoundary label="Flight details">
              {drill.kind === 'bookings' ? (
                <BookingDrillPanel key={`${filterQuery(drill.filters)}|${runKey}`} {...drill} onClose={() => setDrill(null)} />
              ) : (
                <DrillPanel key={`${filterQuery(drill.filters)}|${runKey}`} {...drill} onClose={() => setDrill(null)} />
              )}
            </BiErrorBoundary>
          )}
          <BiErrorBoundary label="Delay causes">
            <Card className={CARD}>
              <ChartHeading title="Top delay causes" subtitle="Announced delay minutes by category, ranked. Click a cause for flights." />
              {causes.data ? (
                causes.data.length === 0 ? (
                  <p className={EMPTY_TEXT}>No delays in this period.</p>
                ) : (
                  <TooltipProvider delayDuration={80}>
                    <ol className="m-0 flex list-none flex-col gap-1 p-0">
                      {causes.data.map((cause, index) => (
                        <li key={cause.category}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-page focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:grid-cols-[12rem_minmax(0,1fr)_9rem]"
                                onClick={() => drillCause(cause.category)}
                                aria-label={`${cause.category.replaceAll('_', ' ')}: ${formatCount(cause.delay_minutes)} minutes across ${formatCount(cause.events)} delays. Show flights.`}
                              >
                                <span className="flex items-center gap-2.5 text-sm capitalize">
                                  <span className="w-4 text-muted-foreground">{index + 1}.</span>
                                  <strong className="font-semibold">{cause.category.replaceAll('_', ' ')}</strong>
                                </span>
                                <span className="col-span-full row-start-2 h-2 overflow-hidden rounded-full bg-muted lg:col-span-1 lg:row-start-auto lg:h-2.5">
                                  <span
                                    className="block h-full"
                                    style={{
                                      width: `${(Math.max(0, cause.delay_minutes) / Math.max(...causes.data!.map((row) => row.delay_minutes), 1)) * 98}%`,
                                      background: CAUSE_COLORS[index % CAUSE_COLORS.length],
                                    }}
                                  />
                                </span>
                                <span className="flex flex-wrap items-baseline justify-end gap-x-1.5 whitespace-nowrap">
                                  <strong className="text-sm font-semibold">{formatCount(cause.delay_minutes)} min</strong>
                                  <span className="text-xs text-muted-foreground">{formatCount(cause.events)} delays</span>
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className={TOOLTIP}>
                              <strong className="capitalize">
                                {cause.category.replaceAll('_', ' ')} · {formatCount(cause.delay_minutes)} minutes
                              </strong>
                              <span>{formatCount(cause.events)} announced delay events. Click to see the flights.</span>
                            </TooltipContent>
                          </Tooltip>
                        </li>
                      ))}
                    </ol>
                  </TooltipProvider>
                )
              ) : causes.error ? (
                <SectionError label="Delay causes" onRetry={causes.retry} />
              ) : (
                <SectionLoading className="h-[260px]" />
              )}
              {drill?.kind === 'cause' && (
                <BiErrorBoundary label="Delay cause flight details">
                  <DrillPanel key={`${filterQuery(drill.filters)}|${runKey}`} {...drill} onClose={() => setDrill(null)} />
                </BiErrorBoundary>
              )}
            </Card>
          </BiErrorBoundary>
        </>
      )}
      <p className={FOOTNOTE}>
        Only flights that have departed are counted. Revenue here is counted by flight date; the Financial report counts by payment month,
        so the totals can differ.
      </p>
      {previous.error && (
        <p className={FOOTNOTE} role="status">
          Previous period comparisons are unavailable. Current figures are still shown.
        </p>
      )}
      {kpis?.load_factor != null && kpis.load_factor > 1 && (
        <Alert>
          <AlertTitle>Load factor over 100%</AlertTitle>
          <AlertDescription>Seats sold exceed available seats. Review the underlying flights before using this figure.</AlertDescription>
        </Alert>
      )}
    </BiPageFrame>
  )
}
