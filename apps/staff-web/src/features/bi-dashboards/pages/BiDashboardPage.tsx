import { useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { filterQuery, NO_FILTERS, useBiApi, type BiCabin, type BiChartName, type BiFilters } from '../api/bi'
import { BiFilters as FilterBar } from '../components/BiFilters'
import { ChartCard } from '../components/ChartCard'
import { DrillPanel } from '../components/DrillPanel'
import { KpiCard } from '../components/KpiCard'
import { DailyTable, RouteTable } from '../components/MetricTables'
import { PeriodTable } from '../components/PeriodTable'
import { useBiDashboard } from '../hooks/useBiDashboard'
import { useBiLoad } from '../hooks/useBiLoad'
import { periodEnd } from '../lib-period'
import { FinancePage } from './FinancePage'
import { BiErrorBoundary } from '../components/BiErrorBoundary'
import { formatCount, formatDateTime, formatMoney, formatPercent } from '../lib-format'

const CHARTS: { name: BiChartName; label: string }[] = [
  { name: 'on-time', label: 'On-time performance' },
  { name: 'load-factor', label: 'Load factor' },
  { name: 'revenue-per-seat', label: 'Revenue per seat' },
  { name: 'bookings', label: 'Bookings and cancellations' },
  { name: 'delay-causes', label: 'Delay causes' },
  { name: 'cabins', label: 'Load factor by cabin' },
]

const CABIN_OPTIONS: { value: BiCabin; label: string }[] = [
  { value: 'first', label: 'First' },
  { value: 'business', label: 'Business' },
  { value: 'premium_economy', label: 'Premium Economy' },
  { value: 'economy', label: 'Economy' },
]

/** What the drill-down panel shows: the flights for a period, a cabin, or a delay cause. */
type Drill = { title: string; description: string; filters: BiFilters } | null

export function BiDashboardPage() {
  const [filters, setFilters] = useState<BiFilters>(NO_FILTERS)
  const [drill, setDrill] = useState<Drill>(null)
  const api = useBiApi()
  const { data, loading, error, refresh, refreshing, refreshError } = useBiDashboard(filters)

  const latest = data?.status.latest_success ?? null
  const lastRun = data?.status.last_run ?? null
  const kpis = data?.kpis.kpis ?? null
  const isRefreshing = refreshing || data?.status.refreshing === true
  // Every dataset below reloads when the latest run changes, so a refresh updates the whole page.
  const runKey = latest?.id ?? 'none'
  const key = (name: string) => `${name}|${filterQuery(filters)}|${runKey}`

  const series = useBiLoad(key('series'), () => api.getSeries(filters))
  const cabins = useBiLoad(key('cabins'), () => api.getCabins(filters))
  const causes = useBiLoad(key('causes'), () => api.getDelayCauses(filters))
  const bookings = useBiLoad(key('bookings'), () => api.getBookingsByRoute(filters))
  const bookingTotals = useBiLoad(key('bookings-series'), () => api.getBookingsSeries(filters))
  const bookingSum = bookingTotals.data?.reduce(
    (t, b) => ({ bookings: t.bookings + b.bookings, cancellations: t.cancellations + b.cancellations }),
    { bookings: 0, cancellations: 0 },
  )
  // The dates are checked before anything is shown: a "from" after the "to" has nothing to show.
  const badDates = Boolean(filters.from && filters.to && filters.from > filters.to)

  function drillPeriod(period: string) {
    const to = periodEnd(period, filters.group)
    setDrill({
      title: `Flights · ${period}`,
      description: filters.group === 'day' ? 'Flights on this date.' : `Flights from ${period} to ${to}.`,
      filters: { ...filters, from: period, to },
    })
  }

  function drillCabin(cabin: BiCabin, label: string) {
    setDrill({
      title: `Flights that sold ${label}`,
      description: `Departed flights that sold ${label} seats.`,
      filters: { ...filters, cabin },
    })
  }

  function drillCause(cause: string) {
    setDrill({
      title: `Flights delayed by ${cause.replace(/_/g, ' ')}`,
      description: 'Departed flights whose largest delay has this cause.',
      filters: { ...filters, cause: cause as BiFilters['cause'] },
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-8">
      <header className="print:hidden flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-heading text-3xl font-bold text-primary">Business intelligence</h1>
          <p className="m-0 text-sm text-muted-foreground">
            {latest
              ? `Data as of ${formatDateTime(latest.data_as_of)} · last refreshed ${formatDateTime(latest.finished_at)}`
              : 'No data yet. Refresh to build the first copy.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isRefreshing && <Badge variant="secondary">Refreshing</Badge>}
          <Button type="button" onClick={() => void refresh()} disabled={isRefreshing}>
            <RefreshCw aria-hidden="true" />
            Refresh data
          </Button>
        </div>
      </header>

      <div className="hidden print:block">
        <h1 className="m-0 font-heading text-2xl font-bold text-primary">Business intelligence report</h1>
        <p className="m-0 text-sm text-muted-foreground">
          {latest ? `Data as of ${formatDateTime(latest.data_as_of)}` : 'No data yet'} · printed {new Date().toISOString().slice(0, 10)}
        </p>
      </div>

      {lastRun?.status === 'failed' && (
        <Alert variant="destructive" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>
            The last refresh failed on {formatDateTime(lastRun.started_at)}. The figures shown are from the last good refresh.
          </AlertDescription>
        </Alert>
      )}
      {isRefreshing && (
        <Alert className="print:hidden">
          <RefreshCw aria-hidden="true" />
          <AlertTitle>Refreshing</AlertTitle>
          <AlertDescription>Pulling the latest departed flights, bookings and revenue. This takes about a minute.</AlertDescription>
        </Alert>
      )}
      {refreshError && (
        <Alert variant="destructive" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{refreshError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="print:hidden">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>Could not load the dashboard ({error}).</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="operations" className="flex flex-col gap-6">
        <TabsList className="print:hidden">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="flex flex-col gap-6">
          <FilterBar
            filters={filters}
            routes={data?.routes ?? []}
            onChange={setFilters}
            onExportCsv={() => void api.downloadCsv(`/api/bi/export/flights.csv?${filterQuery(filters)}`, 'flights.csv')}
            onPrint={() => window.print()}
          />

          {badDates && (
            <Alert variant="destructive" className="print:hidden">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Check the dates</AlertTitle>
              <AlertDescription>The From date is after the To date, so there is nothing to show. Change one of the dates.</AlertDescription>
            </Alert>
          )}

          <BiErrorBoundary label="Headline figures">
            <section aria-labelledby="bi-kpis" className="flex flex-col gap-3">
              <h2 id="bi-kpis" className="m-0 text-lg font-semibold text-foreground">
                Headline figures
              </h2>
              {kpis && !badDates ? (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  <KpiCard label="Flights" value={formatCount(kpis.flight_count)} hint={`${formatCount(kpis.cancelled_count)} cancelled`} />
                  <KpiCard
                    label="On-time"
                    value={formatPercent(kpis.on_time_pct)}
                    hint={`${formatCount(kpis.on_time_count)} of ${formatCount(kpis.departed_count)} departed`}
                  />
                  <KpiCard
                    label="Load factor"
                    value={formatPercent(kpis.load_factor)}
                    hint={`${formatCount(kpis.seat_sold)} of ${formatCount(kpis.seat_available)} seats`}
                  />
                  <KpiCard
                    label="Revenue per seat"
                    value={formatMoney(kpis.revenue_per_seat)}
                    hint={filters.revenueMode === 'after_refunds' ? 'Revenue minus refunds, per seat' : 'Revenue before refunds, per seat'}
                  />
                  <KpiCard label="Revenue" value={formatMoney(kpis.revenue_amount)} hint="Captured fares and seat fees" />
                  <KpiCard label="Refunds" value={formatMoney(kpis.refund_amount)} hint="Succeeded refunds on these flights" />
                  <KpiCard
                    label="Bookings / cancellations"
                    value={bookingSum ? `${formatCount(bookingSum.bookings)} / ${formatCount(bookingSum.cancellations)}` : '—'}
                    hint={
                      bookingSum
                        ? `Net ${formatCount(bookingSum.bookings - bookingSum.cancellations)} · by booking date`
                        : 'By booking date'
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-busy="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-[104px] rounded-xl" />
                  ))}
                </div>
              )}
            </section>
          </BiErrorBoundary>

          <BiErrorBoundary label="Charts">
            <section aria-labelledby="bi-charts" className="flex flex-col gap-3">
              <h2 id="bi-charts" className="m-0 text-lg font-semibold text-foreground">
                Charts
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {CHARTS.map((chart) => (
                  <ChartCard key={chart.name} name={chart.name} label={chart.label} filters={filters} />
                ))}
              </div>
            </section>
          </BiErrorBoundary>

          <BiErrorBoundary label="By period">
            <Card>
              <CardHeader>
                <CardTitle>By period</CardTitle>
                <CardDescription>Press a period to see the flights behind it.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {series.data ? (
                  <PeriodTable
                    rows={series.data}
                    periodLabel={filters.group === 'month' ? 'Month' : filters.group === 'week' ? 'Week starting' : 'Date'}
                    onPick={drillPeriod}
                  />
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </CardContent>
            </Card>
          </BiErrorBoundary>

          <BiErrorBoundary label="By cabin and delay causes">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>By cabin</CardTitle>
                  <CardDescription>Press a cabin to see the flights that sold it.</CardDescription>
                </CardHeader>
                <CardContent>
                  {cabins.data ? (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {CABIN_OPTIONS.map((c) => {
                        const row = cabins.data?.find((r) => r.cabin === c.value)
                        return (
                          <li key={c.value} className="flex items-center justify-between gap-3 text-sm">
                            <Button type="button" variant="link" className="h-auto p-0" onClick={() => drillCabin(c.value, c.label)}>
                              {c.label}
                            </Button>
                            <span>
                              {row && row.seat_available > 0
                                ? `${formatPercent(row.load_factor)} · ${formatCount(row.seat_sold)} of ${formatCount(row.seat_available)} seats`
                                : 'No departed flights'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <Skeleton className="h-32 w-full" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top delay causes</CardTitle>
                  <CardDescription>Ranked by delay minutes. Press a cause to see its flights.</CardDescription>
                </CardHeader>
                <CardContent>
                  {causes.data ? (
                    causes.data.length === 0 ? (
                      <p className="m-0 text-sm text-muted-foreground">No delays in this period.</p>
                    ) : (
                      <ol className="m-0 flex list-none flex-col gap-2 p-0">
                        {causes.data.map((c, i) => (
                          <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                            <span>
                              {i + 1}.{' '}
                              <Button type="button" variant="link" className="h-auto p-0" onClick={() => drillCause(c.category)}>
                                {c.category.replace(/_/g, ' ')}
                              </Button>
                            </span>
                            <span>
                              {formatCount(c.delay_minutes)} min · {formatCount(c.events)} delays
                            </span>
                          </li>
                        ))}
                      </ol>
                    )
                  ) : (
                    <Skeleton className="h-32 w-full" />
                  )}
                </CardContent>
              </Card>
            </div>
          </BiErrorBoundary>

          <BiErrorBoundary label="Flight list">
            {drill && (
              <DrillPanel title={drill.title} description={drill.description} filters={drill.filters} onClose={() => setDrill(null)} />
            )}
          </BiErrorBoundary>

          <BiErrorBoundary label="Bookings and cancellations">
            <Card>
              <CardHeader>
                <CardTitle>Bookings and cancellations by route and date</CardTitle>
                <CardDescription>Counts per route for the booking date, at the route origin.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {bookings.data ? (
                  bookings.data.length === 0 ? (
                    <p className="m-0 py-6 text-center text-sm text-muted-foreground">No bookings for these dates.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Booking date</TableHead>
                          <TableHead scope="col">Route</TableHead>
                          <TableHead scope="col" className="text-right">
                            Bookings
                          </TableHead>
                          <TableHead scope="col" className="text-right">
                            Cancellations
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookings.data.map((b) => (
                          <TableRow key={`${b.booking_date}-${b.origin}-${b.destination}`}>
                            <TableCell>{b.booking_date}</TableCell>
                            <TableCell>{`${b.origin} – ${b.destination}`}</TableCell>
                            <TableCell className="text-right">{formatCount(b.booking_count)}</TableCell>
                            <TableCell className="text-right">{formatCount(b.cancellation_count)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )
                ) : (
                  <Skeleton className="h-40 w-full" />
                )}
              </CardContent>
            </Card>
          </BiErrorBoundary>

          <BiErrorBoundary label="Routes">
            <Card>
              <CardHeader>
                <CardTitle>Routes</CardTitle>
                <CardDescription>Every route for the selected dates, with its rates.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {data ? <RouteTable rows={data.routes} /> : <Skeleton className="h-40 w-full" />}
              </CardContent>
            </Card>
          </BiErrorBoundary>

          <BiErrorBoundary label="Daily figures">
            <Card>
              <CardHeader>
                <CardTitle>Daily figures</CardTitle>
                <CardDescription>One row per flight date for the selected route and dates.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {kpis && data ? <DailyTable rows={data.kpis.daily} /> : <Skeleton className="h-40 w-full" />}
              </CardContent>
            </Card>
          </BiErrorBoundary>

          {loading && data && (
            <span className="sr-only" role="status">
              Updating figures
            </span>
          )}
        </TabsContent>

        <TabsContent value="finance">
          <BiErrorBoundary label="Finance">
            <FinancePage />
          </BiErrorBoundary>
        </TabsContent>
      </Tabs>
    </main>
  )
}
