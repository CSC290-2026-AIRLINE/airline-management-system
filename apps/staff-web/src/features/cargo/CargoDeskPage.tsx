import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, Package, Search, Wrench, X } from 'lucide-react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { Route } from '@staff-web/routes/_authenticated/cargo/bookings.index'
import type { CargoDeskStatus } from '@staff-web/routes/_authenticated/cargo/bookings.index'
import { fmtAwb } from './awb'
import { useCargoApi, type DeskBooking, type DeskListResult } from './cargo-api'

/* ── Constants ───────────────────────────────────────────────────────── */

const STATUS_TABS: { value: CargoDeskStatus; label: string }[] = [
  { value: 'held', label: 'Held' },
  { value: 'booked', label: 'Booked' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'loaded', label: 'Loaded' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'rebook_required', label: 'Rebook needed' },
  { value: 'closed', label: 'Closed' },
]

const STATUS_COLORS: Record<string, string> = {
  held: 'bg-amber-100 text-amber-800',
  booked: 'bg-blue-100 text-blue-800',
  accepted: 'bg-blue-100 text-blue-800',
  loaded: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-indigo-100 text-indigo-800',
  arrived: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  rebook_required: 'bg-orange-100 text-orange-800',
  expired: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
}

/* ── Formatters ──────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

function fmtMoney(amount: number, currency: string) {
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  return `${currency} ${n}`
}

function tabDescription(status: CargoDeskStatus, settings: { holdMinutes: number; claimWindowDays: number }) {
  switch (status) {
    case 'held':
      return `Holds waiting for payment. They expire after ${settings.holdMinutes} minutes.`
    case 'booked':
      return 'Paid and confirmed. Waiting for the cargo at the terminal.'
    case 'accepted':
      return 'Weighed and accepted at the terminal. Waiting to be loaded.'
    case 'loaded':
      return 'On board. Waiting for departure.'
    case 'in_transit':
      return 'In the air.'
    case 'arrived':
      return 'Landed. Waiting for the consignee to collect.'
    case 'delivered':
      return `Collected by the consignee. Claims can be filed for ${settings.claimWindowDays} days.`
    case 'rebook_required':
      return 'The flight was cancelled or diverted. Move each booking to another flight or cancel it with a refund.'
    case 'closed':
      return 'Expired holds, cancelled and rejected bookings. Every paid booking here was refunded in full.'
  }
}

function pageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

/* ── Main component ──────────────────────────────────────────────────── */

export function CargoDeskPage() {
  const { status, flight, shipDate, commodity } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const api = useCargoApi()

  const [result, setResult] = useState<DeskListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [tick, setTick] = useState(0)
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<string | null>(null)
  const [csvBusy, setCsvBusy] = useState(false)

  const filterKey = `${status}|${flight ?? ''}|${shipDate ?? ''}|${commodity ?? ''}|${debouncedSearch}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPage(1)
    setPrevFilterKey(filterKey)
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.listBookings({
          status,
          q: debouncedSearch || undefined,
          page,
          flightId: flight,
          shipDate,
          commodityTypeId: commodity,
        })
        if (!cancelled) setResult(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load bookings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, debouncedSearch, page, flight, shipDate, commodity, tick])

  const reload = () => setTick((n) => n + 1)

  const counts = result?.counts ?? {}
  const settings = result?.settings ?? { holdMinutes: 15, claimWindowDays: 14 }
  const filters = result?.filters ?? { flights: [], commodityTypes: [] }

  const totalPages = result?.totalPages ?? 0
  const total = result?.total ?? 0
  const from = total > 0 ? (page - 1) * (result?.pageSize ?? 20) + 1 : 0
  const to = total > 0 ? Math.min(page * (result?.pageSize ?? 20), total) : 0

  return (
    <TooltipProvider delayDuration={300}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Cargo desk</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every cargo booking. Filter by status, or search by reference, Air Waybill, shipper or flight.
          </p>
        </div>
        {import.meta.env.DEV && <TestToolsMenu onCreated={reload} onToast={setToast} />}
      </div>

      {/* Toast */}
      {toast && <div className="fixed right-4 top-4 z-50 rounded-lg border bg-background px-4 py-2.5 text-sm shadow-lg">{toast}</div>}

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Reference, Air Waybill, shipper or flight"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <NativeSelect
          value={flight ?? ''}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, flight: e.target.value || undefined }), replace: true })}
        >
          <option value="">Flight: all</option>
          {filters.flights.map((f) => (
            <option key={f.id} value={f.id}>
              {f.flightNumber}
            </option>
          ))}
        </NativeSelect>

        <div className="flex items-center gap-1.5">
          <Label htmlFor="shipDate" className="whitespace-nowrap text-muted-foreground">
            Ship date:
          </Label>
          <Input
            id="shipDate"
            type="date"
            value={shipDate ?? ''}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, shipDate: e.target.value || undefined }), replace: true })}
            className="w-auto"
          />
          {shipDate && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Clear ship date"
              onClick={() => navigate({ search: (prev) => ({ ...prev, shipDate: undefined }), replace: true })}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        <NativeSelect
          value={commodity ?? ''}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, commodity: e.target.value || undefined }), replace: true })}
        >
          <option value="">Commodity: all</option>
          {filters.commodityTypes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-9"
          disabled={csvBusy}
          onClick={async () => {
            setCsvBusy(true)
            try {
              await api.downloadBookingsCsv({
                status,
                q: debouncedSearch || undefined,
                flightId: flight,
                shipDate,
                commodityTypeId: commodity,
              })
            } catch (e) {
              setToast(e instanceof Error ? e.message : 'CSV download failed')
            } finally {
              setCsvBusy(false)
            }
          }}
        >
          {csvBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
          Download CSV
        </Button>
      </div>

      {/* Main card */}
      <div className="mt-4 rounded-xl border bg-white p-5 dark:bg-card">
        {/* Status tabs */}
        <Tabs
          value={status}
          onValueChange={(value) => navigate({ search: (prev) => ({ ...prev, status: value as CargoDeskStatus }), replace: true })}
        >
          <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-none border-b bg-transparent p-0">
            {STATUS_TABS.map((tab) => {
              const count = counts[tab.value]
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-none rounded-none border-0 border-b-2 border-transparent px-3 pt-1 pb-2 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab.label}
                  {count != null && count > 0 && <span className="ml-1 text-xs tabular-nums opacity-60">{count}</span>}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {/* Tab description */}
        <p className="mt-3 text-xs text-slate-500">{tabDescription(status, settings)}</p>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {/* Content */}
        {loading && !result ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : result && result.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Package className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-slate-500">No bookings in this tab.</p>
          </div>
        ) : result ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-muted/50 dark:hover:bg-muted/50">
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Booking</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Flight</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Shipper → Consignee</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Commodity · Pcs</TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Chargeable</TableHead>
                    <TableHead className="text-right text-[11px] font-medium uppercase tracking-wide text-slate-500">Charge</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</TableHead>
                    <TableHead className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Booked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.data.map((b) => (
                    <BookingRow key={b.id} booking={b} />
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  Showing {from}–{to} of {total}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    {pageRange(page, totalPages).map((p, i) =>
                      p === '...' ? (
                        <span key={`e${i}`} className="px-1 text-slate-400">
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 min-w-8"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      ),
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

/* ── BookingRow ───────────────────────────────────────────────────────── */

function BookingRow({ booking: b }: { booking: DeskBooking }) {
  const navigate = useNavigate()

  return (
    <TableRow
      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/30"
      onClick={() => navigate({ to: '/cargo/bookings/$id', params: { id: b.id } })}
    >
      <TableCell className="py-2.5">
        <div className="text-sm font-semibold">{b.bookingRef}</div>
        <div className="text-xs text-slate-400">{b.awbNumber ? `AWB ${fmtAwb(b.awbNumber)}` : 'No AWB, never paid'}</div>
      </TableCell>
      <TableCell className="py-2.5">
        <div className="whitespace-nowrap text-sm">
          {b.flightNumber} · {fmtDate(b.flightServiceDate)}
        </div>
        <div className="whitespace-nowrap text-xs text-slate-400">
          {fmtTime(b.flightDepAt)} · {b.flightOrigin} → {b.flightDestination}
        </div>
      </TableCell>
      <TableCell className="max-w-[180px] py-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block truncate text-sm">
              {b.shipperName} → {b.consigneeName}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {b.shipperName} → {b.consigneeName}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2.5 text-sm">
        {b.commodityTypeName} · {b.pieces} pcs
      </TableCell>
      <TableCell className="py-2.5 text-right text-sm tabular-nums">{b.quotedChargeableKg.toFixed(1)} kg</TableCell>
      <TableCell className="py-2.5 text-right">
        <div className="text-sm tabular-nums">{fmtMoney(b.quotedCharge, b.currency)}</div>
        {b.hasRefund && <div className="text-xs text-slate-400">Refunded</div>}
      </TableCell>
      <TableCell className="py-2.5">
        <StatusPill status={b.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap py-2.5 text-xs text-slate-400">{fmtDateTime(b.bookedAt)}</TableCell>
    </TableRow>
  )
}

/* ── StatusPill ───────────────────────────────────────────────────────── */

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-muted text-muted-foreground'
  return (
    <Badge variant="outline" className={`whitespace-nowrap border-transparent capitalize ${color}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

/* ── TestToolsMenu (dev only) ────────────────────────────────────────── */

function TestToolsMenu({ onCreated, onToast }: { onCreated: () => void; onToast: (msg: string) => void }) {
  const api = useCargoApi()
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    try {
      const msg = await action()
      onToast(msg)
      onCreated()
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Wrench className="mr-1.5 size-3.5" />}
          Test tools
          <ChevronDown className="ml-1 size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            run(async () => {
              const r = await api.createTestFlights()
              return r.error ?? `Created ${r.created?.length ?? 0} flights`
            })
          }
        >
          Create test flights
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(async () => {
              const r = await api.createTestBookings(3)
              if (r.error) return r.error
              const parts = [`Created ${r.created?.length ?? 0} bookings`]
              if (r.failed?.length) parts.push(`${r.failed.length} failed`)
              return parts.join(', ')
            })
          }
        >
          Create test bookings (×3)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
