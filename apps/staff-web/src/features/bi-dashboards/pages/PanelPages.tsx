import { useEffect, useState, type ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { ChartFrame } from '../components/InteractiveCharts'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useBiApi, type BiFilters as FilterState, type BiGroup } from '../api/bi'
import { BiFilters } from '../components/BiFilters'
import { BiPageHeader } from '../components/BiPageHeader'
import { KpiCard } from '../components/KpiCard'
import { BarPanelChart, LinePanelChart } from '../components/PanelCharts'
import { RankBars } from '../components/RankBars'
import { MarkForMaintenance } from '../components/MarkForMaintenance'
import { useBiLoad } from '../hooks/useBiLoad'
import { defaultFilters } from '../lib-comparison'
import { formatCompact, formatCount, formatDateTime, formatPercent, formatThb } from '../lib-format'

/** How often an open panel re-reads the BI copy. Matches the backend's automatic refresh. */
const AUTO_RELOAD_MS = 15_000

/** A period label for the chosen grouping: "5 Oct" for a day or week, "Oct 2026" for a month. */
function periodLabel(period: string, group: BiGroup): string {
  const options: Intl.DateTimeFormatOptions =
    group === 'month' ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(`${period}T00:00:00Z`))
}

/**
 * Shared frame for the panels: the title, the "Data as of" pill and Refresh, then the filter bar. `onReload` reloads the
 * panel's own data after a refresh. The view tabs come from BiPageHeader's context.
 */
function PanelFrame({
  title,
  description,
  filters,
  onFiltersChange,
  onReload,
  fleetWide = false,
  children,
}: {
  title: string
  description: string
  /** Figures that are not split by route: the route list is hidden and a note says so. */
  fleetWide?: boolean
  filters: FilterState
  onFiltersChange: (next: FilterState) => void
  onReload: () => void
  children: ReactNode
}) {
  const api = useBiApi()
  // The filter bar edits a draft; the page loads the applied filters, which change only when Apply is clicked.
  const [draft, setDraft] = useState<FilterState>(filters)
  const status = useBiLoad('bi-status', () => api.getStatus())
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const latest = status.data?.latest_success ?? status.previousData?.latest_success ?? null

  // The backend rebuilds the copy every 15 seconds, so the open panel re-reads it on the same beat.
  useEffect(() => {
    const timer = setInterval(() => {
      status.retry()
      onReload()
    }, AUTO_RELOAD_MS)
    return () => clearInterval(timer)
    // The retry functions only queue a state update, so the closures from the first render keep working.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await api.refresh()
      status.retry()
      onReload()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <main className="bi-page">
      <BiPageHeader
        title={title}
        description={description}
        status={latest ? `Data as of ${formatDateTime(latest.data_as_of)}` : 'No successful refresh yet'}
        action={
          <Button type="button" variant="outline" className="bi-button" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      />
      <div className="bi-page-content">
        <BiFiltersRouted filters={draft} onChange={setDraft} onApply={() => onFiltersChange(draft)} fleetWide={fleetWide} />
        {refreshError && (
          <Alert variant="destructive">
            <AlertDescription>Refresh failed: {refreshError}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>
    </main>
  )
}

/** The route list comes from the same endpoint as the dashboard, for the dates chosen here. */
function BiFiltersRouted({
  filters,
  onChange,
  onApply,
  fleetWide,
}: {
  filters: FilterState
  onChange: (next: FilterState) => void
  onApply: () => void
  fleetWide: boolean
}) {
  const api = useBiApi()
  const routes = useBiLoad(`routes|${filters.from}|${filters.to}`, () => api.getRoutes(filters))
  return (
    <BiFilters
      filters={filters}
      routes={routes.data ?? routes.previousData ?? []}
      onChange={onChange}
      onPrint={() => window.print()}
      onApply={onApply}
      showRoute={!fleetWide}
      note={fleetWide ? 'Fleet-wide, not split by route' : undefined}
    />
  )
}

/** Loading, error and empty states for a panel's data. */
function PanelState({
  loading,
  error,
  onRetry,
  empty,
  emptyText,
}: {
  loading: boolean
  error: string | null
  onRetry: () => void
  empty: boolean
  emptyText: string
}) {
  if (loading) return <Skeleton className="h-64 w-full" />
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load this panel ({error}).{' '}
          <button type="button" className="underline" onClick={onRetry}>
            Try again
          </button>
        </AlertDescription>
      </Alert>
    )
  if (empty) return <p className="p-6 text-sm text-muted-foreground">{emptyText}</p>
  return null
}

/* ---------------------------------------------------------------- No-shows */

export function NoShowsView() {
  const api = useBiApi()
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const data = useBiLoad(`no-shows|${JSON.stringify(filters)}`, () => api.getNoShows(filters))
  const body = data.data ?? data.previousData
  const weeks = body?.weeks ?? []
  const totals = weeks.reduce((t, w) => ({ booked: t.booked + w.booked, boarded: t.boarded + w.boarded, no_show: t.no_show + w.no_show }), {
    booked: 0,
    boarded: 0,
    no_show: 0,
  })
  const routes = [...(body?.routes ?? [])].sort((a, b) => (b.no_show_rate ?? -1) - (a.no_show_rate ?? -1))
  const worst = routes[0]
  const rateRows = weeks.map((w) => (w.no_show_rate === null ? null : w.no_show_rate * 100))
  const labels = weeks.map((w) => periodLabel(w.period, filters.group))

  return (
    <PanelFrame
      title="Business intelligence"
      description="Who was booked, boarded, denied or did not show up, by route and date. Read only."
      filters={filters}
      onFiltersChange={setFilters}
      onReload={data.retry}
    >
      <PanelState
        loading={data.loading && !body}
        error={data.error}
        onRetry={data.retry}
        empty={!data.loading && !data.error && weeks.length === 0}
        emptyText="No flights with a closed gate in these dates."
      />
      {body && weeks.length > 0 && (
        <>
          <section className="bi-kpis">
            <KpiCard
              label="No-show rate"
              value={formatPercent(totals.booked > 0 ? totals.no_show / totals.booked : null)}
              hint="No-shows ÷ booked passengers"
              comparison="No previous period data"
            />
            <KpiCard
              label="No-shows"
              value={formatCount(totals.no_show)}
              hint={`Out of ${formatCount(totals.booked)} booked`}
              comparison="No previous period data"
            />
            <KpiCard
              label="Boarded"
              value={formatCount(totals.boarded)}
              hint={totals.booked > 0 ? `${formatPercent(totals.boarded / totals.booked)} of booked` : '—'}
              comparison="No previous period data"
            />
            <KpiCard
              label="Highest no-show route"
              value={worst ? `${worst.origin}-${worst.destination}` : '—'}
              hint={worst ? `${formatPercent(worst.no_show_rate)} no-show` : 'No routes'}
              comparison="Could be overbooked a little"
            />
          </section>
          <section className="bi-chart-pair">
            <LinePanelChart
              title={`No-show rate by ${filters.group}`}
              labels={labels}
              values={rateRows}
              color="#d92d20"
              format={(v) => `${v.toFixed(1)}%`}
              yTitle="No-show %"
            />
            <BarPanelChart
              title="Passengers by boarding result"
              subtitle={`Per ${filters.group}`}
              labels={labels}
              stacked
              labelTotals={weeks.map((w) => w.booked)}
              series={[
                { name: 'Boarded', color: '#102544', values: weeks.map((w) => w.boarded) },
                { name: 'Denied', color: '#64748b', values: weeks.map((w) => w.denied) },
                { name: 'No-show', color: '#d92d20', values: weeks.map((w) => w.no_show) },
              ]}
              format={(v) => formatCompact(v)}
              yTitle="Passengers"
            />
          </section>
          <RankBars
            title="No-show rate by route"
            subtitle="Ranked"
            format={(v) => formatPercent(v)}
            rows={routes.map((r, i) => ({
              key: r.route_id,
              label: `${r.origin}-${r.destination}`,
              value: r.no_show_rate,
              detail: `${formatCount(r.no_show)} of ${formatCount(r.booked)}`,
              alert: i === 0,
            }))}
          />
        </>
      )}
    </PanelFrame>
  )
}

/* ----------------------------------------------------------- Extra revenue */

const EXTRA_TYPES: { key: string; label: string; color: string }[] = [
  { key: 'baggage', label: 'Baggage', color: '#102544' },
  { key: 'upgrade', label: 'Upgrade', color: '#f2a800' },
  { key: 'onboard_order', label: 'Onboard food', color: '#2a7f84' },
  { key: 'insurance', label: 'Insurance', color: '#94a3b8' },
]

export function ExtraRevenueView() {
  const api = useBiApi()
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const data = useBiLoad(`extra-revenue|${JSON.stringify(filters)}`, () => api.getExtraRevenue(filters))
  const periods = data.data ?? data.previousData ?? []
  const sum = <K extends 'gross' | 'refunds' | 'net' | 'passengers'>(key: K) => periods.reduce((t, p) => t + p[key], 0)
  const gross = sum('gross')
  const net = sum('net')
  const refunds = sum('refunds')
  const passengers = sum('passengers')
  const typeGross = (key: string) => periods.reduce((t, p) => t + (p.by_type[key] ?? 0), 0)
  const typeRefunds = (key: string) => periods.reduce((t, p) => t + (p.refunds_by_type?.[key] ?? 0), 0)
  const biggest = EXTRA_TYPES.reduce((best, t) => (typeGross(t.key) > typeGross(best.key) ? t : best), EXTRA_TYPES[0])
  const labels = periods.map((p) => periodLabel(p.period, filters.group))
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${filters.from}T00:00:00Z`),
  )

  return (
    <PanelFrame
      title="Business intelligence"
      description="Money from bags, upgrades, onboard food and insurance. Read only."
      filters={filters}
      onFiltersChange={setFilters}
      onReload={data.retry}
      fleetWide
    >
      <PanelState
        loading={data.loading && !data.previousData}
        error={data.error}
        onRetry={data.retry}
        empty={!data.loading && !data.error && periods.length === 0}
        emptyText="No extra-revenue payments in these dates yet."
      />
      {periods.length > 0 && (
        <>
          <section className="bi-kpis">
            <KpiCard label="Extra revenue" value={formatThb(net, true)} hint="After refunds" comparison="No previous period data" />
            <KpiCard
              label="Per passenger"
              value={formatThb(passengers > 0 ? net / passengers : null)}
              hint="Extra revenue ÷ passengers flown"
              comparison="No previous period data"
            />
            <KpiCard
              label="Biggest type"
              value={biggest.label}
              hint={gross > 0 ? `${formatPercent(typeGross(biggest.key) / gross)} of extra revenue` : '—'}
              comparison="No previous period data"
            />
            <KpiCard
              label="Refunds"
              value={formatThb(refunds, true)}
              hint={gross > 0 ? `${formatPercent(refunds / gross)} of extra revenue` : '—'}
              comparison="No previous period data"
            />
          </section>
          <BarPanelChart
            title="Extra revenue by type"
            subtitle="THB, by payment date. Label = total after refunds"
            labels={labels}
            stacked
            series={EXTRA_TYPES.map((t) => ({ name: t.label, color: t.color, values: periods.map((p) => p.by_type[t.key] ?? 0) }))}
            labelTotals={periods.map((p) => p.net)}
            format={(v) => formatThb(v, true)}
            yTitle="THB"
          />
          <section className="bi-chart-pair">
            <ChartFrame title="By type" subtitle={monthName}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {EXTRA_TYPES.map((t) => {
                    const revenue = typeGross(t.key)
                    const refund = typeRefunds(t.key)
                    return (
                      <TableRow key={t.key}>
                        <TableCell>{t.label}</TableCell>
                        <TableCell className="text-right">{formatCount(Math.round(revenue))}</TableCell>
                        <TableCell className="text-right">{formatCount(Math.round(refund))}</TableCell>
                        <TableCell className="text-right">{formatCount(Math.round(revenue - refund))}</TableCell>
                        <TableCell className="text-right">{gross > 0 ? formatPercent(revenue / gross) : '—'}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{formatCount(Math.round(gross))}</TableCell>
                    <TableCell className="text-right">{formatCount(Math.round(refunds))}</TableCell>
                    <TableCell className="text-right">{formatCount(Math.round(net))}</TableCell>
                    <TableCell className="text-right">{gross > 0 ? '100%' : '—'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </ChartFrame>
            <LinePanelChart
              title="Extra revenue per passenger"
              subtitle={`THB per ${filters.group}`}
              labels={labels}
              values={periods.map((p) => p.per_passenger)}
              color="#2a7f84"
              format={(v) => formatThb(v)}
              yTitle="THB"
            />
          </section>
        </>
      )}
    </PanelFrame>
  )
}

/* ------------------------------------------------------------- Aircraft use */

const IDLE_HOURS_PER_DAY = 6

/** Whole days a downtime period covers inside `[from, to]`, both ends inclusive. */
function daysInRange(start: string, end: string, from: string, to: string): number {
  const s = start > from ? start : from
  const e = end < to ? end : to
  if (e < s) return 0
  return Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000) + 1
}

export function AircraftUseView() {
  const api = useBiApi()
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const data = useBiLoad(`aircraft-use|${JSON.stringify(filters)}`, () => api.getAircraftUse(filters))
  const body = data.data ?? data.previousData
  const aircraft = body?.aircraft ?? []
  const hours = aircraft.reduce((t, a) => t + a.hours_flown, 0)
  const availableDays = aircraft.reduce((t, a) => t + a.available_days, 0)
  const outDays = aircraft.reduce((t, a) => t + a.out_of_service_days, 0)
  const ranked = [...aircraft].sort((a, b) => (a.hours_per_day ?? 0) - (b.hours_per_day ?? 0))
  const lowUse = aircraft.filter((a) => a.hours_per_day !== null && a.hours_per_day < IDLE_HOURS_PER_DAY)
  const weeks = body?.weeks ?? []
  const tailOf = (id: string) => aircraft.find((a) => a.aircraft_id === id)
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${filters.from}T00:00:00Z`),
  )

  return (
    <PanelFrame
      title="Business intelligence"
      description="How many hours each aircraft flies, and how long it is out of service. Read only."
      filters={filters}
      onFiltersChange={setFilters}
      onReload={data.retry}
      fleetWide
    >
      <PanelState
        loading={data.loading && !body}
        error={data.error}
        onRetry={data.retry}
        empty={!data.loading && !data.error && aircraft.length === 0}
        emptyText="No aircraft in the copy yet."
      />
      {body && aircraft.length > 0 && (
        <>
          <section className="bi-kpis">
            <KpiCard
              label="Hours per aircraft per day"
              value={availableDays > 0 ? `${(hours / availableDays).toFixed(1)} h` : '—'}
              hint="Hours flown ÷ days it could fly"
              comparison="No previous period data"
            />
            <KpiCard
              label="Aircraft in fleet"
              value={formatCount(aircraft.length)}
              hint={`${formatCount(Math.round(hours))} hours flown in total`}
              comparison="No previous period data"
            />
            <KpiCard
              label="Days out of service"
              value={formatCount(outDays)}
              hint="Maintenance and grounded"
              comparison="No previous period data"
            />
            <KpiCard
              label="Low-use aircraft"
              value={formatCount(lowUse.length)}
              hint={
                lowUse.length > 0
                  ? `${lowUse.map((a) => a.tail_number).join(', ')} under ${IDLE_HOURS_PER_DAY} h per day`
                  : `None under ${IDLE_HOURS_PER_DAY} h per day`
              }
              comparison={lowUse.length > 0 ? 'Could take more flights' : 'No aircraft to rebalance'}
            />
          </section>
          <MarkForMaintenance aircraft={aircraft} onDone={data.retry} />
          <RankBars
            title="Hours flown per available day"
            subtitle="Ranked, lowest first. Click an aircraft for details."
            legend={[
              { label: 'Hours per day', color: '#102544' },
              { label: `Below ${IDLE_HOURS_PER_DAY} h: sits idle`, color: '#d92d20' },
            ]}
            format={(v) => `${v.toFixed(1)} h/day`}
            rows={ranked.map((a) => ({
              key: a.aircraft_id,
              label: (
                <>
                  {a.tail_number} <small className="bi-rank-type">{a.type_code}</small>
                </>
              ),
              value: a.hours_per_day,
              detail: `${formatCount(a.out_of_service_days)} days out`,
              alert: a.hours_per_day !== null && a.hours_per_day < IDLE_HOURS_PER_DAY,
            }))}
          />
          <section className="bi-chart-pair">
            <BarPanelChart
              title={`Fleet hours by ${filters.group}`}
              subtitle="All aircraft"
              labels={weeks.map((w) => periodLabel(w.period, filters.group))}
              series={[{ name: 'Hours flown', color: '#2a7f84', values: weeks.map((w) => w.hours_flown) }]}
              labelTotals={weeks.map((w) => w.hours_flown)}
              format={(v) => `${Math.round(v)} h`}
              yTitle="Hours"
            />
            <ChartFrame title="Days out of service" subtitle={monthName}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aircraft</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(body?.downtime ?? []).map((d, i) => {
                    const a = tailOf(d.aircraft_id)
                    return (
                      <TableRow key={`${d.aircraft_id}-${d.start_date}-${i}`}>
                        <TableCell>
                          {a?.tail_number ?? '—'} <small className="bi-rank-type">{a?.type_code ?? ''}</small>
                        </TableCell>
                        <TableCell>{d.reason ?? (d.status === 'in_maintenance' ? 'In maintenance' : 'Grounded')}</TableCell>
                        <TableCell>{d.start_date === d.end_date ? d.start_date : `${d.start_date} to ${d.end_date}`}</TableCell>
                        <TableCell className="text-right">
                          {formatCount(daysInRange(d.start_date, d.end_date, filters.from, filters.to))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ChartFrame>
          </section>
        </>
      )}
    </PanelFrame>
  )
}
