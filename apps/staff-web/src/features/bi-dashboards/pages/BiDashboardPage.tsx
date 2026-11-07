import { useState } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { BiChartName, BiFilters as Filters } from '../api/bi'
import { BiFilters } from '../components/BiFilters'
import { ChartCard } from '../components/ChartCard'
import { KpiCard } from '../components/KpiCard'
import { DailyTable, RouteTable } from '../components/MetricTables'
import { useBiDashboard } from '../hooks/useBiDashboard'
import { formatCount, formatDateTime, formatMoney, formatPercent } from '../lib-format'

const CHARTS: { name: BiChartName; label: string }[] = [
  { name: 'on-time', label: 'On-time performance' },
  { name: 'load-factor', label: 'Load factor' },
  { name: 'revenue-per-seat', label: 'Revenue per seat by route' },
  { name: 'bookings', label: 'Bookings and cancellations' },
  { name: 'delay-causes', label: 'Delay causes' },
]

/** Default range: none, so the page shows everything in the copy until staff narrow it. */
const NO_FILTERS: Filters = { from: '', to: '', routeId: '' }

export function BiDashboardPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const { data, loading, error, refresh, refreshing, refreshError } = useBiDashboard(filters)

  const latest = data?.status.latest_success ?? null
  const kpis = data?.kpis.kpis ?? null
  const isRefreshing = refreshing || data?.status.refreshing === true

  return (
    <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
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

      {refreshError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{refreshError}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>Could not load the dashboard ({error}).</AlertDescription>
        </Alert>
      )}

      <BiFilters filters={filters} routes={data?.routes ?? []} onChange={setFilters} />

      <section aria-labelledby="bi-kpis" className="flex flex-col gap-3">
        <h2 id="bi-kpis" className="m-0 text-lg font-semibold text-foreground">
          Headline figures
        </h2>
        {kpis ? (
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
            <KpiCard label="Revenue per seat" value={formatMoney(kpis.revenue_per_seat)} hint="Revenue minus refunds, per seat" />
            <KpiCard label="Revenue" value={formatMoney(kpis.revenue_amount)} hint="Captured fares and seat fees" />
            <KpiCard label="Refunds" value={formatMoney(kpis.refund_amount)} hint="Succeeded refunds on these flights" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="bi-charts" className="flex flex-col gap-3">
        <h2 id="bi-charts" className="m-0 text-lg font-semibold text-foreground">
          Charts
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CHARTS.map((chart) => (
            <ChartCard key={chart.name} name={chart.name} label={chart.label} filters={filters} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Routes</CardTitle>
          <CardDescription>Every route for the selected dates, with its rates.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data ? <RouteTable rows={data.routes} /> : <Skeleton className="h-40 w-full" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily figures</CardTitle>
          <CardDescription>One row per flight date for the selected route and dates.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {kpis && data ? <DailyTable rows={data.kpis.daily} /> : <Skeleton className="h-40 w-full" />}
        </CardContent>
      </Card>

      {loading && data && (
        <span className="sr-only" role="status">
          Updating figures
        </span>
      )}
    </main>
  )
}
