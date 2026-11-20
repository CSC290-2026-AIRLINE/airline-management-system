import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { StaffNotProvisionedScreen } from '@staff-web/features/admin-console/components/StaffNotProvisionedScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { filterQuery, useBiApi, type BiCabin, type BiFilters } from '../api/bi'
import { BiFilters as FilterBar } from '../components/BiFilters'
import { BiWorkspace, type BiView } from '../components/BiWorkspace'
import { BiPageHeader } from '../components/BiPageHeader'
import { DrillPanel } from '../components/DrillPanel'
import { BookingDrillPanel } from '../components/BookingDrillPanel'
import { KpiCard } from '../components/KpiCard'
import { BI_COLORS } from '../chart-colors'
import { CabinChart, OnTimeChart, PeriodBarChart } from '../components/InteractiveCharts'
import { BiErrorBoundary } from '../components/BiErrorBoundary'
import { useBiDashboard } from '../hooks/useBiDashboard'
import { useBiLoad } from '../hooks/useBiLoad'
import { periodEnd } from '../lib-period'
import { comparison, defaultFilters, previousFilters, relativeChange } from '../lib-comparison'
import { formatCompact, formatCount, formatDateTime, formatPercent, formatThb } from '../lib-format'
import { FinancePage } from './FinancePage'

type Drill = { title: string; description: string; filters: BiFilters; kind: 'period' | 'cabin' | 'cause' | 'bookings' } | null
const CAUSE_COLORS = [BI_COLORS.navy, BI_COLORS.blue, BI_COLORS.teal, '#8a94a6', BI_COLORS.yellow, '#b7bfcf', BI_COLORS.red]
function LoadFailure({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Card className="bi-chart-card">
      <h2>{label}</h2>
      <div className="bi-chart-empty" role="alert">
        <div>
          <p>Could not load these figures.</p>
          <Button variant="outline" className="bi-button" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  )
}
function currentView(): BiView {
  return window.location.hash === '#finance' ? 'finance' : 'operations'
}

const VIEWS: BiView[] = ['operations', 'finance']
const VIEW_SCREENS: Record<BiView, string> = { operations: 'f14.operations', finance: 'f14.finance' }

/**
 * The `/bi` route. Shows only the views the signed-in role holds (Feature 15 screen access); the API checks the same
 * screens, so hiding a view is not the protection. Each view loads only its own data.
 */
export function BiDashboardPage() {
  const auth = useAppAuth()
  const access = useScreenAccess()
  const api = useBiApi()
  const [view, setView] = useState<BiView>(currentView)
  const [operationsClock, setOperationsClock] = useState<string | null>(null)
  const views = VIEWS.filter((v) => access.canOpen(VIEW_SCREENS[v]))
  const shown: BiView | undefined = views.includes(view) ? view : views[0]
  // The operations view reports its own clock; the finance view has no status load, so this one feeds the sidebar.
  const financeStatus = useBiLoad(`status|${shown ?? 'none'}`, () => (shown === 'finance' ? api.getStatus() : Promise.resolve(null)))

  useEffect(() => {
    const update = () => setView(currentView())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  function changeView(next: BiView) {
    window.location.hash = next
    setView(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  if (access.loading) return <p className="p-6 text-sm text-muted-foreground">Checking your access…</p>
  if (access.provisioned === false) return <StaffNotProvisionedScreen email={auth.user?.email} />
  if (access.error) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Could not check your access ({access.error}). Reload the page to try again.
      </p>
    )
  }
  if (!shown) return <NoAccessScreen screenName="Business intelligence" roleName={access.role?.name} recorded={false} />

  return (
    <BiWorkspace
      view={shown}
      views={views}
      onViewChange={changeView}
      name={auth.user?.email ?? 'Staff member'}
      clock={shown === 'finance' ? (financeStatus.data?.simulation_now ?? null) : operationsClock}
      onSignOut={() => void auth.logout()}
    >
      {shown === 'finance' ? (
        <BiErrorBoundary label="Financial report">
          <FinancePage />
        </BiErrorBoundary>
      ) : (
        <OperationsView onClock={setOperationsClock} />
      )}
    </BiWorkspace>
  )
}

/** The operations dashboard. Mounted only for roles with `f14.operations`, so its requests never run for anyone else. */
function OperationsView({ onClock }: { onClock: (clock: string | null) => void }) {
  const [filters, setFilters] = useState<BiFilters>(defaultFilters)
  const [drill, setDrill] = useState<Drill>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const api = useBiApi()
  const { data, previousData, loading, error, refresh, refreshing, refreshError, retry } = useBiDashboard(filters)
  const status = data?.status ?? previousData?.status
  const latest = status?.latest_success ?? null
  const lastRun = status?.last_run ?? null
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

  const clock = status?.simulation_now ?? latest?.data_as_of ?? null
  useEffect(() => onClock(clock), [clock, onClock])

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
    <>
      <BiPageHeader
        title="Business intelligence"
        description="On-time performance, load factor, revenue per seat and bookings by route and date. Read only."
        status={latest ? `Data as of ${formatDateTime(latest.data_as_of)}` : 'No data refreshed yet'}
        action={
          <Button variant="outline" className="bi-button" onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing && <RefreshCw className="animate-spin" />} {isRefreshing ? 'Refreshing' : 'Refresh'}
          </Button>
        }
      />
      <div className="bi-page-content" aria-busy={loading}>
        {(error || refreshError || exportError || chartError) && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>
              {error || refreshError || exportError || `Could not load chart data (${chartError}).`}
              {(error || chartError) && (
                <Button variant="outline" className="bi-button" onClick={retryReads}>
                  Retry figures
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {lastRun?.status === 'failed' && (
          <Alert variant="destructive">
            <AlertTitle>Last refresh failed</AlertTitle>
            <AlertDescription>The figures shown are from the last successful refresh. Try Refresh again.</AlertDescription>
          </Alert>
        )}
        {isRefreshing && (
          <Alert>
            <RefreshCw className="animate-spin" />
            <AlertTitle>Refreshing data</AlertTitle>
            <AlertDescription>
              Pulling the latest departed flights, bookings and revenue. The previous figures stay available while the refresh runs.
            </AlertDescription>
          </Alert>
        )}
        <FilterBar
          filters={filters}
          routes={data?.routes ?? previousData?.routes ?? []}
          onChange={changeFilters}
          onExportCsv={() => void exportCsv()}
          onPrint={() => window.print()}
        />
        {badDates ? (
          <Alert variant="destructive">
            <AlertTitle>Check the dates</AlertTitle>
            <AlertDescription>The From date is after the To date. Change one of the dates to see the dashboard.</AlertDescription>
          </Alert>
        ) : empty ? (
          <Card className="bi-empty">
            <h2>No flights for this route and dates</h2>
            <p>Try another route or a wider date range.</p>
            <Button variant="outline" className="bi-button" onClick={() => changeFilters({ ...filters, routeId: '', from: '', to: '' })}>
              Clear filters
            </Button>
          </Card>
        ) : (
          <>
            <BiErrorBoundary label="Headline figures">
              <section aria-label="Headline figures" className="bi-kpis">
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
                    <LoadFailure label="Headline figures" onRetry={retry} />
                  </div>
                ) : (
                  Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[124px] rounded-xl" />)
                )}
              </section>
            </BiErrorBoundary>
            <BiErrorBoundary label="Charts">
              <section aria-label="Operations charts" className="bi-chart-grid">
                {series.data ? (
                  <OnTimeChart rows={series.data} group={filters.group} onPick={(period) => drillPeriod(period, 'On-time performance')} />
                ) : series.error ? (
                  <LoadFailure label="On-time performance" onRetry={series.retry} />
                ) : (
                  <Skeleton className="h-[332px] rounded-xl" />
                )}
                {cabins.data ? (
                  <CabinChart
                    rows={cabins.data}
                    previous={!previous.loading && !previous.error ? (previous.data?.cabins ?? []) : []}
                    onPick={drillCabin}
                  />
                ) : cabins.error ? (
                  <LoadFailure label="Load factor by cabin" onRetry={cabins.retry} />
                ) : (
                  <Skeleton className="h-[332px] rounded-xl" />
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
                  <LoadFailure label="Revenue per seat" onRetry={series.retry} />
                ) : (
                  <Skeleton className="h-[332px] rounded-xl" />
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
                  <LoadFailure label="Bookings vs cancellations" onRetry={bookings.retry} />
                ) : (
                  <Skeleton className="h-[332px] rounded-xl" />
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
              <Card className="bi-delay-card">
                <div className="bi-chart-heading">
                  <h2>Top delay causes</h2>
                  <span>Announced delay minutes by category, ranked. Click a cause for flights.</span>
                </div>
                {causes.data ? (
                  causes.data.length === 0 ? (
                    <p className="bi-chart-empty">No delays in this period.</p>
                  ) : (
                    <TooltipProvider delayDuration={80}>
                      <ol className="bi-delay-list">
                        {causes.data.map((cause, index) => (
                          <li key={cause.category}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => drillCause(cause.category)}
                                  aria-label={`${cause.category.replaceAll('_', ' ')}: ${formatCount(cause.delay_minutes)} minutes across ${formatCount(cause.events)} delays. Show flights.`}
                                >
                                  <span className="bi-cause-name">
                                    <span>{index + 1}.</span>
                                    <strong>{cause.category.replaceAll('_', ' ')}</strong>
                                  </span>
                                  <span className="bi-cause-track">
                                    <span
                                      style={{
                                        width: `${(Math.max(0, cause.delay_minutes) / Math.max(...causes.data!.map((row) => row.delay_minutes), 1)) * 98}%`,
                                        background: CAUSE_COLORS[index % CAUSE_COLORS.length],
                                      }}
                                    />
                                  </span>
                                  <span className="bi-cause-detail">
                                    <strong>{formatCount(cause.delay_minutes)} min</strong>
                                    <span>{formatCount(cause.events)} delays</span>
                                  </span>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bi-chart-tooltip">
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
                  <LoadFailure label="Delay causes" onRetry={causes.retry} />
                ) : (
                  <Skeleton className="h-[260px]" />
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
        <p className="bi-footnote">
          Only flights that have departed are counted. Delay minutes are the announced delay minutes, which can differ from the departure
          delay when time is made up. Revenue here is counted by flight date; the financial report counts by payment month (Feature 4), so
          the totals can differ.
        </p>
        {previous.error && (
          <p className="bi-footnote" role="status">
            Previous period comparisons are unavailable. Current figures are still shown.
          </p>
        )}
        {kpis?.load_factor != null && kpis.load_factor > 1 && (
          <Alert>
            <AlertTitle>Load factor over 100%</AlertTitle>
            <AlertDescription>Seats sold exceed available seats. Review the underlying flights before using this figure.</AlertDescription>
          </Alert>
        )}
      </div>
    </>
  )
}
