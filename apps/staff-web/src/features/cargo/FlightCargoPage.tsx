import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle, Download, Loader2, Package, PackageCheck } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { Route } from '@staff-web/routes/_authenticated/cargo/flights'
import { useCargoApi, type FlightListResult, type FlightManifest, type FlightSummary, type ManifestRow } from './cargo-api'

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function fmtKg(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n) + ' kg'
}

function fmtKgWhole(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n) + ' kg'
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} h ${m} m` : `${h} h`
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const FLIGHT_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  delayed: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-600',
  departed: 'bg-green-100 text-green-800',
  arrived: 'bg-green-100 text-green-800',
}

const CARGO_STATUS_COLORS: Record<string, string> = {
  booked: 'bg-blue-100 text-blue-800',
  accepted: 'bg-blue-100 text-blue-800',
  loaded: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-indigo-100 text-indigo-800',
  arrived: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
}

function FlightStatusPill({ status }: { status: string }) {
  const color = FLIGHT_STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`whitespace-nowrap border-transparent capitalize ${color}`}>
      {status}
    </Badge>
  )
}

function CargoStatusPill({ status }: { status: string }) {
  const color = CARGO_STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`whitespace-nowrap border-transparent capitalize ${color}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

/* ── Main ────────────────────────────────────────────────────────────── */

export function FlightCargoPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const api = useCargoApi()

  const defaultFrom = search.from ?? todayStr()
  const defaultTo = search.to ?? plusDays(todayStr(), 3)

  const [listResult, setListResult] = useState<FlightListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [summary, setSummary] = useState<FlightSummary | null>(null)
  const [manifest, setManifest] = useState<FlightManifest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTick, setDetailTick] = useState(0)

  const [pendingAutoSelect, setPendingAutoSelect] = useState<string | null>(null)
  const selectedFlightId = search.flight ?? null

  if (pendingAutoSelect && !search.flight) {
    navigate({ search: (prev) => ({ ...prev, flight: pendingAutoSelect }), replace: true })
    setPendingAutoSelect(null)
  } else if (pendingAutoSelect) {
    setPendingAutoSelect(null)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listFlightsWithCargo(defaultFrom, defaultTo, search.route)
        if (!cancelled) {
          setListResult(data)
          if (data.flights.length > 0 && !search.flight) {
            setPendingAutoSelect(data.flights[0].id)
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load flights')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFrom, defaultTo, search.route])

  const [prevFlightId, setPrevFlightId] = useState(selectedFlightId)
  if (selectedFlightId !== prevFlightId) {
    setPrevFlightId(selectedFlightId)
    if (!selectedFlightId) {
      setSummary(null)
      setManifest(null)
    }
  }

  useEffect(() => {
    if (!selectedFlightId) return undefined
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      try {
        const [s, m] = await Promise.all([api.getFlightSummary(selectedFlightId), api.getFlightManifest(selectedFlightId)])
        if (!cancelled) {
          setSummary(s)
          setManifest(m)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load flight detail')
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlightId, detailTick])

  const reloadDetail = () => setDetailTick((n) => n + 1)
  const flights = listResult?.flights ?? []
  const routes = listResult?.routes ?? []
  const cancelledFlight = flights.find((f) => f.id === selectedFlightId && f.status === 'cancelled')

  return (
    <TooltipProvider delayDuration={300}>
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Flight cargo</h1>
        <p className="mt-1 text-sm text-slate-500">Hold capacity, manifest and loading for one flight.</p>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {/* Card 1: Flights with cargo */}
      <div className="mt-6 rounded-xl border bg-white p-5 dark:bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Flights with cargo</h2>
          <div className="flex items-center gap-2">
            <select
              value={search.route ?? ''}
              onChange={(e) => navigate({ search: (prev) => ({ ...prev, route: e.target.value || undefined }), replace: true })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Route: all</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.origin} → {r.destination}
                </option>
              ))}
            </select>

            <DateRangeSelector
              from={defaultFrom}
              to={defaultTo}
              onChange={(f, t) => navigate({ search: (prev) => ({ ...prev, from: f, to: t }), replace: true })}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : flights.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-slate-500">No flights in this date range.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-muted/50">
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Flight</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Date</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Departs</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Aircraft</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Bookings</TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Committed</TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flights.map((f) => {
                    const isSelected = selectedFlightId === f.id
                    const isCancelled = f.status === 'cancelled'
                    return (
                      <TableRow
                        key={f.id}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : ''}`}
                        onClick={() => navigate({ search: (prev) => ({ ...prev, flight: f.id }), replace: true })}
                      >
                        <TableCell className="py-2.5 text-sm font-medium text-blue-600">{f.flightNumber}</TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 text-sm">{fmtDate(f.serviceDate)}</TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 text-sm">{fmtTime(f.depAt)}</TableCell>
                        <TableCell className="py-2.5 font-mono text-xs">{f.aircraft}</TableCell>
                        <TableCell className="py-2.5">
                          <FlightStatusPill status={f.status} />
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-sm tabular-nums">{f.bookingCount}</TableCell>
                        <TableCell className="py-2.5 text-right text-sm tabular-nums">{fmtKg(f.committedKg)}</TableCell>
                        <TableCell className="py-2.5 text-right text-sm tabular-nums">
                          {isCancelled ? (
                            <span className="text-slate-400">none</span>
                          ) : (
                            <span className={`font-semibold ${f.availableKg < 0 ? 'text-red-600' : ''}`}>{fmtKg(f.availableKg)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {cancelledFlight && (
              <p className="mt-3 text-xs text-slate-400">
                {cancelledFlight.flightNumber} on {fmtDate(cancelledFlight.serviceDate)} is cancelled. Its bookings show as Rebook needed on
                the Cargo desk, where staff move each to another flight or cancel it with a full refund.
              </p>
            )}
          </>
        )}
      </div>

      {/* Detail cards */}
      {selectedFlightId &&
        (detailLoading ? (
          <div className="mt-4 flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : summary && manifest ? (
          <div className="mt-4 flex flex-col gap-4">
            <FlightSummaryCard summary={summary} />
            <HoldCapacityCard summary={summary} />
            <ManifestCard manifest={manifest} flightId={selectedFlightId} onReload={reloadDetail} />
          </div>
        ) : null)}
    </TooltipProvider>
  )
}

/* ── DateRangeSelector ───────────────────────────────────────────────── */

function DateRangeSelector({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => onChange(e.target.value || todayStr(), to)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="text-xs text-slate-400">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange(from, e.target.value || from)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

/* ── Card 2: Flight summary ──────────────────────────────────────────── */

function FlightSummaryCard({ summary: s }: { summary: FlightSummary }) {
  return (
    <div className="rounded-xl border bg-white p-5 dark:bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-bold">{s.flightNumber}</span>
          <span className="text-sm text-slate-500">{fmtDateLong(s.serviceDate)}</span>
        </div>
        <FlightStatusPill status={s.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryField label="Route" value={`${s.origin} ${fmtTime(s.depAt)} → ${s.destination} ${fmtTime(s.arrAt)}`} />
        <SummaryField label="Flight time" value={`${fmtDuration(s.blockTimeMin)}, direct`} />
        <SummaryField label="Aircraft" value={s.aircraft} />
        <SummaryField label="Seats" value={String(s.sellableSeats)} />
        <SummaryField label="Passengers booked" value={String(s.seatsTaken)} />
        <SummaryField label="Booking cutoff" value={fmtTime(s.bookingCutoffAt)} />
      </div>
    </div>
  )
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  )
}

/* ── Card 3: Hold capacity ───────────────────────────────────────────── */

function HoldCapacityCard({ summary: s }: { summary: FlightSummary }) {
  const limit = s.holdLimitKg
  const reserve = s.baggageReserveKg
  const committedNotLoaded = s.committedKg - s.loadedKg
  const loaded = s.loadedKg
  const overBy = s.availableKg < 0 ? Math.abs(s.availableKg) : 0

  const pctOf = (v: number) => (limit > 0 ? (v / limit) * 100 : 0)

  const floor = Math.ceil((s.sellableSeats * s.floorPercent) / 100)

  return (
    <div className="rounded-xl border bg-white p-5 dark:bg-card">
      <h2 className="text-base font-semibold">Hold capacity</h2>

      {/* Stacked bar */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="bg-slate-400" style={{ width: `${pctOf(reserve)}%` }} />
        <div className="bg-blue-900" style={{ width: `${pctOf(Math.max(committedNotLoaded, 0))}%` }} />
        <div className="bg-blue-500" style={{ width: `${pctOf(loaded)}%` }} />
        {overBy > 0 && <div className="bg-red-500" style={{ width: `${pctOf(overBy)}%` }} />}
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-slate-500">
        <LegendItem color="bg-slate-400" label="Baggage reserve" />
        <LegendItem color="bg-blue-900" label="Committed cargo" />
        <LegendItem color="bg-blue-500" label="Loaded" />
        <LegendItem color="bg-slate-200" label="Free" />
        {overBy > 0 && <LegendItem color="bg-red-500" label={`Over by ${fmtKg(overBy)}`} />}
      </div>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={fmtKgWhole(s.holdLimitKg)} label="Hold limit" />
        <StatTile value={fmtKgWhole(s.baggageReserveKg)} label={`Baggage reserve (${s.reservedPassengers} × ${s.reserveKgPerPax})`} />
        <StatTile value={fmtKg(s.committedKg)} label={`Committed (${fmtKg(s.loadedKg)} loaded)`} />
        <StatTile value={fmtKg(s.availableKg)} label="Available" negative={s.availableKg < 0} />
      </div>

      {/* Explanation */}
      <p className="mt-3 text-xs text-slate-400">
        Baggage reserve = {s.reservedPassengers} reserved passengers × {s.reserveKgPerPax} kg = {fmtKgWhole(s.baggageReserveKg)}. Reserved
        passengers are the larger of seats sold or held ({s.seatsTaken}) and {s.floorPercent}% of the sellable seats ({floor} of{' '}
        {s.sellableSeats}). Available = {fmtKgWhole(s.holdLimitKg)} − {fmtKgWhole(s.baggageReserveKg)} − {fmtKg(s.committedKg)} ={' '}
        {fmtKg(s.availableKg)}.
      </p>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function StatTile({ value, label, negative }: { value: string; label: string; negative?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4 dark:bg-muted/50">
      <div className={`text-lg font-semibold tabular-nums ${negative ? 'text-red-600' : ''}`}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  )
}

/* ── Card 4: Manifest ────────────────────────────────────────────────── */

function ManifestCard({ manifest, flightId, onReload }: { manifest: FlightManifest; flightId: string; onReload: () => void }) {
  const api = useCargoApi()
  const nav = useNavigate()
  const [pending, setPending] = useState<{ row: ManifestRow; event: 'loaded' | 'delivered' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)

  const doConfirm = async () => {
    if (!pending) return
    setBusy(true)
    setDialogError(null)
    try {
      await api.postEvent(pending.row.id, { event: pending.event })
      setPending(null)
      onReload()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const downloadCsv = async () => {
    setCsvBusy(true)
    try {
      await api.downloadManifestCsv(flightId, manifest.flightNumber)
    } catch {
      // silent
    } finally {
      setCsvBusy(false)
    }
  }

  const openBooking = (id: string) => {
    nav({ to: '/cargo/bookings/$id', params: { id }, search: { from: 'flight' as const, flight: flightId } })
  }

  const rows = manifest.rows
  const totalDeclared = rows.reduce((s, r) => s + r.declaredWeightKg, 0)
  const totalMeasured = rows.reduce((s, r) => s + (r.measuredWeightKg ?? 0), 0)
  const totalPieces = rows.reduce((s, r) => s + r.pieces, 0)
  const measuredCount = rows.filter((r) => r.measuredWeightKg != null).length

  return (
    <div className="rounded-xl border bg-white p-5 dark:bg-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Manifest</h2>
        <Button variant="outline" size="sm" disabled={csvBusy} onClick={downloadCsv}>
          {csvBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
          Download CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No paid bookings on this flight yet.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-muted/50">
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">AWB</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Shipper → Consignee</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Commodity</TableHead>
                  <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Pcs</TableHead>
                  <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Declared</TableHead>
                  <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Measured</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/30"
                    onClick={() => openBooking(r.id)}
                  >
                    <TableCell className="py-2.5 text-sm font-semibold">{r.awbNumber ?? '—'}</TableCell>
                    <TableCell className="max-w-[200px] py-2.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block truncate text-sm">
                            {r.shipperName} → {r.consigneeName}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {r.shipperName} → {r.consigneeName}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <div className="text-sm">{r.commodityTypeName}</div>
                      <div className="text-xs text-slate-400">{r.handlingClass.replace(/_/g, ' ')}</div>
                    </TableCell>
                    <TableCell className="py-2.5 text-right text-sm tabular-nums">{r.pieces}</TableCell>
                    <TableCell className="py-2.5 text-right text-sm tabular-nums">{r.declaredWeightKg.toFixed(1)}</TableCell>
                    <TableCell className="py-2.5 text-right text-sm tabular-nums">
                      {r.measuredWeightKg != null ? r.measuredWeightKg.toFixed(1) : '—'}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <CargoStatusPill status={r.status} />
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      {r.status === 'booked' && (
                        <span
                          className="cursor-pointer text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
                          onClick={(e) => {
                            e.stopPropagation()
                            openBooking(r.id)
                          }}
                        >
                          Review
                        </span>
                      )}
                      {r.status === 'accepted' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPending({ row: r, event: 'loaded' })
                          }}
                        >
                          <PackageCheck className="mr-1 size-3" />
                          Mark loaded
                        </Button>
                      )}
                      {r.status === 'arrived' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPending({ row: r, event: 'delivered' })
                          }}
                        >
                          <CheckCircle className="mr-1 size-3" />
                          Mark delivered
                        </Button>
                      )}
                      {!['booked', 'accepted', 'arrived'].includes(r.status) && <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-slate-50 font-semibold dark:bg-muted/50">
                  <TableCell className="py-2.5 text-sm">Total</TableCell>
                  <TableCell className="py-2.5 text-sm">{rows.length} Air Waybills</TableCell>
                  <TableCell />
                  <TableCell className="py-2.5 text-right text-sm tabular-nums">{totalPieces}</TableCell>
                  <TableCell className="py-2.5 text-right text-sm tabular-nums">{totalDeclared.toFixed(1)}</TableCell>
                  <TableCell className="py-2.5 text-right">
                    <div className="text-sm tabular-nums">{totalMeasured.toFixed(1)}</div>
                    <div className="text-xs font-normal text-slate-400">
                      {measuredCount} of {rows.length} measured
                    </div>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {/* Footer notes */}
          <div className="mt-3 flex flex-wrap justify-between gap-4 text-xs text-slate-400">
            <span>
              {rows.length} Air Waybills · {manifest.loadedCount} of {rows.length} loaded. Mark loaded rechecks the hold against loaded
              baggage.
            </span>
            <span>Departure and arrival times come from flight scheduling.</span>
          </div>
        </>
      )}

      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>{pending?.event === 'loaded' ? 'Mark loaded' : 'Mark delivered'}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Mark <span className="font-medium text-foreground">{pending?.row.awbNumber ?? pending?.row.id.slice(0, 8)}</span> as{' '}
            {pending?.event}?
          </p>
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy} onClick={doConfirm}>
              {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
