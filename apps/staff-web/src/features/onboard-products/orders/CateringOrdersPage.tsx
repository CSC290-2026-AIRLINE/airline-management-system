// Catering Orders master-detail page.
// Left: a list of upcoming flights with search and filters. Right: the
// selected flight's catering order (progress bar, key facts, banner,
// lines table, action buttons).
// Reuses the shared Toast, the Stock page's select/card patterns, and
// the shared stock store. No "Simulated today" badge.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { CateringApiError, useOnboardApi } from '@staff-web/features/onboard-products/api'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { ConfirmDialog } from '@staff-web/features/onboard-products/catalog'
import { PageHeader } from '@staff-web/features/onboard-products/ui'
import type {
  Cabin,
  CateringOrder,
  CateringOrderLine,
  Flight,
  FlightCateringStatus,
  StockBatch,
  Warehouse,
} from '@staff-web/features/onboard-products/api/types'

// -- helpers ---------------------------------------------------------------

// Flight times are shown in the departure airport's local time (like F2's flight pages), falling back to the
// browser's zone when the server sends none.
function formatDateTime(iso: string, timeZone?: string | null): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  })
}

function formatTime(iso: string, timeZone?: string | null): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) })
}

function formatQuantity(n: number): string {
  return n.toLocaleString('en-US')
}

const CABIN_ORDER: Cabin[] = ['economy', 'premium_economy', 'business']

function cabinLabel(c: Cabin | 'all'): string {
  if (c === 'economy') return 'Economy'
  if (c === 'premium_economy') return 'Premium economy'
  if (c === 'business') return 'Business'
  return 'All cabins'
}

// Build the derived UI status used by the right-card title and the
// progress bar. Distinct from Flight.status so we can say
// "Ordering open" / "Order ready" / "Loaded" / "Closed out" / "Void".
// no_order: ordering has closed but the flight never got a catering order (for example its departure airport has no
// F12 warehouse), so it must not read "Ordering open".
// not_loaded: the order was generated but the flight departed without it being loaded.
type UiStatus = 'ordering_open' | 'no_order' | 'order_ready' | 'not_loaded' | 'loaded' | 'closed' | 'void'

// The list endpoint already carries each flight's catering-order status
// on Flight.status, so the chips can be right for every row.
function flightStatusToUi(status: FlightCateringStatus): UiStatus {
  switch (status) {
    case 'void':
      return 'void'
    case 'closed':
      return 'closed'
    case 'loaded':
      return 'loaded'
    case 'generated':
      return 'order_ready'
    default:
      return 'ordering_open'
  }
}

function uiStatus(flight: Flight, order: CateringOrder | null): UiStatus {
  // The catering order is only fetched for the selected flight, so it is
  // missing for every other row -- reading the status from it alone made
  // the whole list read "ordering open" until you picked a flight. Use
  // the flight's own status, which the list endpoint returns for all of
  // them, and prefer the fetched order when there is one: right after an
  // action it is the fresher of the two.
  const base = order
    ? order.status === 'closed'
      ? 'closed'
      : order.status === 'loaded'
        ? 'loaded'
        : order.status === 'void'
          ? 'void'
          : 'order_ready'
    : flight.status === 'open' && !flight.orderingOpen
      ? 'no_order'
      : flightStatusToUi(flight.status)
  return base === 'order_ready' && flight.departed ? 'not_loaded' : base
}

function uiStatusLabel(s: UiStatus): string {
  if (s === 'ordering_open') return 'Ordering open'
  if (s === 'no_order') return 'No order'
  if (s === 'not_loaded') return 'Not loaded'
  if (s === 'order_ready') return 'Order ready'
  if (s === 'loaded') return 'Loaded'
  if (s === 'closed') return 'Closed out'
  return 'Void'
}

function statusBadgeVariant(s: UiStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (s === 'ordering_open') return 'secondary'
  if (s === 'no_order') return 'outline'
  if (s === 'not_loaded') return 'destructive'
  if (s === 'order_ready') return 'default'
  if (s === 'loaded') return 'outline'
  if (s === 'closed') return 'outline'
  return 'destructive'
}

function statusFilterValue(s: UiStatus): string {
  return s
}

function lineIsShort(line: CateringOrderLine): boolean {
  return line.quantityShort > 0
}

function groupByCabin(lines: CateringOrderLine[]): { cabin: Cabin | 'all'; lines: CateringOrderLine[] }[] {
  // Sort within each cabin by source (default first) then product name.
  const sorted = [...lines].sort((a, b) => {
    if (a.cabin !== b.cabin) {
      const ai = a.cabin === 'all' ? CABIN_ORDER.length : CABIN_ORDER.indexOf(a.cabin)
      const bi = b.cabin === 'all' ? CABIN_ORDER.length : CABIN_ORDER.indexOf(b.cabin)
      return ai - bi
    }
    if (a.source !== b.source) return a.source === 'default' ? -1 : 1
    return a.productName.localeCompare(b.productName)
  })
  const groups: { cabin: Cabin | 'all'; lines: CateringOrderLine[] }[] = []
  for (const line of sorted) {
    const key = line.cabin
    const last = groups[groups.length - 1]
    if (last && last.cabin === key) last.lines.push(line)
    else groups.push({ cabin: key, lines: [line] })
  }
  return groups
}

// The stage changes that need an "are you sure" first. `null` means no
// dialog is open.
type PendingAction = 'transfer'

// -- component -------------------------------------------------------------

export function CateringOrdersPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authenticated/catering/orders' }) as { flightId?: string }
  const api = useOnboardApi()

  const [flights, setFlights] = useState<Flight[]>([])
  const [orders, setOrders] = useState<Record<string, CateringOrder | null>>({})
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [pageSize, setPageSize] = useState(8)
  const [searchText, setSearchText] = useState('')
  const [airportFilter, setAirportFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  function showToast(kind: 'success' | 'error', message: string) {
    if (kind === 'success') toast.success(message)
    else toast.error(message)
  }

  // Initial load: list flights, preselect the first (or the one in the URL).
  useEffect(() => {
    let cancelled = false
    Promise.all([api.orders.listCateringOrders(), api.stock.listWarehouses()])
      .then(async ([flightsData, warehousesData]) => {
        if (cancelled) return
        setFlights(flightsData)
        setWarehouses(warehousesData)
        const initial = search.flightId != null ? (flightsData.find((f) => f.id === search.flightId) ?? flightsData[0]) : flightsData[0]
        setSelectedId(initial?.id ?? null)
        if (initial) {
          const o = await api.orders.getCateringOrder(initial.id)
          if (!cancelled) {
            setOrders((prev) => ({ ...prev, [initial.id]: o }))
            if (o?.warehouseId) {
              const bs = await api.stock.listStockBatches({ warehouseId: o.warehouseId })
              if (!cancelled) setBatches(bs)
            }
          }
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load flights.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only set once on mount
  }, [])

  // Switch selected flight: also load its order (if any).
  useEffect(() => {
    if (selectedId == null) return
    if (orders[selectedId] !== undefined) return
    let cancelled = false
    api.orders
      .getCateringOrder(selectedId)
      .then(async (o) => {
        if (cancelled) return
        setOrders((prev) => ({ ...prev, [selectedId]: o }))
        if (o?.warehouseId) {
          const bs = await api.stock.listStockBatches({ warehouseId: o.warehouseId })
          if (!cancelled) setBatches(bs)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Could not load the catering order.'
        showToast('error', message)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, orders, api])

  // Re-fetch the flight list (e.g. after a load/close that flips a chip).
  async function refreshFlights() {
    const data = await api.orders.listCateringOrders()
    setFlights(data)
  }

  async function refreshSelectedOrder(): Promise<void> {
    if (selectedId == null) return
    const o = await api.orders.getCateringOrder(selectedId)
    setOrders((prev) => ({ ...prev, [selectedId]: o }))
  }
  void refreshSelectedOrder

  // -- action handlers -----------------------------------------------------
  //
  // The stage changes (transfer, close out) run only after the
  // "are you sure" dialog is confirmed. Each handler closes the dialog
  // when it finishes, whichever way it went; failures show a toast.

  async function handleRefresh() {
    if (selectedId == null) return
    setBusy(true)
    try {
      const order = await api.orders.refreshCateringOrderApi(selectedId)
      setOrders((prev) => ({ ...prev, [selectedId]: order }))
      showToast('success', 'Order refreshed against current warehouse stock.')
    } catch (err) {
      if (err instanceof CateringApiError) {
        showToast('error', err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not refresh the order.'
        showToast('error', message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleTransfer() {
    if (selectedId == null) return
    setBusy(true)
    try {
      await api.orders.createStockTransfer(selectedId)
      const order = await api.orders.markCateringOrderLoadedApi(selectedId)
      setOrders((prev) => ({ ...prev, [selectedId]: order }))
      await refreshFlights()
      showToast('success', 'Stock transferred to the aircraft. Order loaded.')
    } catch (err) {
      if (err instanceof CateringApiError) {
        showToast('error', err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not transfer the stock.'
        showToast('error', message)
      }
    } finally {
      setBusy(false)
      setPendingAction(null)
    }
  }

  function confirmPendingAction() {
    if (pendingAction === 'transfer') void handleTransfer()
  }

  // -- derived state ------------------------------------------------------

  const airports = useMemo(() => {
    const set = new Set(flights.map((f) => f.departureAirport))
    return Array.from(set).sort()
  }, [flights])

  const filteredFlights = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return flights.filter((f) => {
      if (airportFilter !== 'all' && f.departureAirport !== airportFilter) return false
      const o = orders[f.id] ?? null
      const ui = uiStatus(f, o)
      if (statusFilter !== 'all' && statusFilterValue(ui) !== statusFilter) return false
      if (q !== '') {
        const hay = `${f.flightNumber} ${f.departureAirport} ${f.arrivalAirport}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [flights, orders, searchText, airportFilter, statusFilter])

  const visibleFlights = filteredFlights.slice(0, pageSize)
  const canShowMore = filteredFlights.length > pageSize

  const selectedFlight = flights.find((f) => f.id === selectedId) ?? null
  const selectedOrder = selectedId ? (orders[selectedId] ?? null) : null
  const selectedStatus: UiStatus | null = selectedFlight ? uiStatus(selectedFlight, selectedOrder) : null
  const selectedWarehouse = selectedFlight ? (warehouses.find((w) => w.id === selectedFlight.warehouseId) ?? null) : null
  const shortLineCount = selectedOrder ? selectedOrder.lines.filter(lineIsShort).length : 0
  const totalUnits = selectedOrder ? selectedOrder.lines.reduce((acc, l) => acc + l.quantityRequired, 0) : 0
  const totalShort = selectedOrder ? selectedOrder.lines.reduce((acc, l) => acc + l.quantityShort, 0) : 0

  // Copy for the "are you sure" dialog. Each stage change says what it
  // is about to do and what it does to the stock.
  function pendingDialog(): { title: string; body: string; confirmLabel: string } | null {
    const flightNumber = selectedFlight?.flightNumber ?? 'this flight'
    const itemCount = selectedOrder?.lines.length ?? 0
    if (pendingAction === 'transfer') {
      return {
        title: 'Transfer the stock to the aircraft?',
        body:
          `This loads ${itemCount} item${itemCount === 1 ? '' : 's'} (${formatQuantity(totalUnits)} units) for ${flightNumber} onto the aircraft and takes them out of ` +
          `${selectedWarehouse?.name ?? 'the warehouse'}. The stock leaves the warehouse and cannot be put back from this page.`,
        confirmLabel: 'Transfer to aircraft',
      }
    }
    return null
  }

  const dialog = pendingDialog()

  function onSelectFlight(id: string) {
    setSelectedId(id)
    void navigate({ to: '/catering/orders', search: { flightId: id }, replace: true })
  }

  // -- render --------------------------------------------------------------

  if (loadError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Catering Orders"
        description="What each flight needs once ordering closes, checked against the warehouse before you load it. Transfer to the aircraft when the items are covered, or refresh the order after receiving more stock."
      />

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          busy={busy}
          onClose={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* Left list --------------------------------------------------------- */}
        <Card className="gap-4" aria-label="Flights">
          <CardHeader>
            <CardTitle>Flights</CardTitle>
            <CardAction className="text-sm text-muted-foreground">
              {filteredFlights.length} of {flights.length}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              type="search"
              placeholder="Search flight or route"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setPageSize(8)
              }}
              aria-label="Search flights"
            />

            <div className="grid grid-cols-2 gap-2">
              <NativeSelect
                className="w-full"
                value={airportFilter}
                onChange={(e) => {
                  setAirportFilter(e.target.value)
                  setPageSize(8)
                }}
                aria-label="Airport filter"
              >
                <NativeSelectOption value="all">All airports</NativeSelectOption>
                {airports.map((a) => (
                  <NativeSelectOption key={a} value={a}>
                    {a}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                className="w-full"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPageSize(8)
                }}
                aria-label="Status filter"
              >
                <NativeSelectOption value="all">Any status</NativeSelectOption>
                <NativeSelectOption value="ordering_open">Ordering open</NativeSelectOption>
                <NativeSelectOption value="no_order">No order</NativeSelectOption>
                <NativeSelectOption value="not_loaded">Not loaded</NativeSelectOption>
                <NativeSelectOption value="order_ready">Order ready</NativeSelectOption>
                <NativeSelectOption value="loaded">Loaded</NativeSelectOption>
                <NativeSelectOption value="closed">Closed out</NativeSelectOption>
                <NativeSelectOption value="void">Void</NativeSelectOption>
              </NativeSelect>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2" aria-busy="true">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : visibleFlights.length === 0 ? (
              <p className="m-0 py-6 text-center text-sm text-muted-foreground">No flights match these filters.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleFlights.map((f) => {
                  const o = orders[f.id] ?? null
                  const ui = uiStatus(f, o)
                  const active = f.id === selectedId
                  const oShort = o ? o.lines.filter(lineIsShort).length : 0
                  const isShort = oShort > 0 && ui === 'order_ready'
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={cn(
                        'flex flex-col gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        active && 'border-primary bg-accent ring-1 ring-primary',
                      )}
                      onClick={() => onSelectFlight(f.id)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{f.flightNumber}</span>
                        <Badge variant={isShort ? 'destructive' : statusBadgeVariant(ui)}>{isShort ? 'Short' : uiStatusLabel(ui)}</Badge>
                      </span>
                      <span className="text-sm">
                        {f.departureAirport} → {f.arrivalAirport}
                      </span>
                      <span className="flex gap-3 text-xs text-muted-foreground">
                        <span>{formatDateTime(f.scheduledDeparture, f.departureTimeZone)}</span>
                        <span>{f.passengerCount} pax</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {canShowMore && (
              <Button type="button" variant="outline" onClick={() => setPageSize((n) => n + 10)} disabled={loading}>
                Show 10 more
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Right detail ------------------------------------------------------ */}
        <Card className="gap-5" aria-label="Catering order details">
          {!selectedFlight || !selectedStatus ? (
            <CardContent>
              <p className="m-0 py-6 text-center text-sm text-muted-foreground">Pick a flight on the left to see the catering order.</p>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-xl">
                  {selectedFlight.flightNumber} · {selectedFlight.departureAirport} → {selectedFlight.arrivalAirport}
                </CardTitle>
                <CardDescription>Catering order for this flight</CardDescription>
                <CardAction className="flex flex-wrap items-center justify-end gap-2">
                  {selectedStatus === 'order_ready' && (
                    <Button type="button" variant="outline" onClick={handleRefresh} disabled={busy}>
                      Refresh order
                    </Button>
                  )}
                  {selectedStatus === 'order_ready' && (
                    <Button
                      type="button"
                      onClick={() => setPendingAction('transfer')}
                      disabled={busy || shortLineCount > 0}
                      title={shortLineCount > 0 ? 'Some items are short: receive stock first' : undefined}
                    >
                      Transfer to aircraft
                    </Button>
                  )}
                  {selectedStatus === 'loaded' && (
                    <>
                      <Button type="button" disabled>
                        Loaded
                      </Button>
                      {/* An order is closed out by submitting the flight report (doc, step 9), so this opens it. */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void navigate({ to: '/catering/flight-report', search: { flightId: selectedFlight.id } })}
                        disabled={busy}
                      >
                        Close out
                      </Button>
                    </>
                  )}
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-5">
                {selectedStatus === 'order_ready' && shortLineCount > 0 && (
                  <p className="m-0 text-sm text-destructive">Some items are short — receive more stock first</p>
                )}

                <ProgressSteps status={selectedStatus} />

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Fact label="Departs" value={formatDateTime(selectedFlight.scheduledDeparture, selectedFlight.departureTimeZone)} />
                  <Fact label="Passengers" value={formatQuantity(selectedFlight.passengerCount)} />
                  <Fact label="Loads from" value={selectedWarehouse ? selectedWarehouse.name : selectedFlight.warehouseId || '—'} />
                  <Fact label="Ordering closed" value={formatDateTime(selectedFlight.cutoffAt, selectedFlight.departureTimeZone)} />
                </div>

                {selectedStatus === 'ordering_open' && (
                  <Alert>
                    <AlertDescription className="text-foreground">
                      Ordering is open until {formatTime(selectedFlight.cutoffAt, selectedFlight.departureTimeZone)} on{' '}
                      {formatDateTime(selectedFlight.cutoffAt, selectedFlight.departureTimeZone)}. The catering order is generated
                      automatically at the cutoff.
                    </AlertDescription>
                  </Alert>
                )}

                {selectedStatus === 'order_ready' && shortLineCount > 0 && selectedWarehouse && (
                  <Alert variant="destructive">
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        {shortLineCount} item{shortLineCount === 1 ? '' : 's'} short in {selectedWarehouse.code}. Receive a delivery, then
                        refresh the order.
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void navigate({ to: '/catering/stock/receive', search: { airport: selectedWarehouse.code } })}
                      >
                        Receive delivery
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {selectedStatus === 'ordering_open' && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    <strong className="block text-foreground">No lines yet</strong>
                    The catering order is generated automatically when ordering closes at{' '}
                    {formatDateTime(selectedFlight.cutoffAt, selectedFlight.departureTimeZone)}. Refresh the page then.
                  </div>
                )}

                {selectedStatus === 'not_loaded' && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      This flight departed before its catering order was loaded, so the stock was never transferred.
                    </AlertDescription>
                  </Alert>
                )}

                {selectedStatus === 'no_order' && (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    <strong className="block text-foreground">No catering order</strong>
                    Ordering closed at {formatDateTime(selectedFlight.cutoffAt, selectedFlight.departureTimeZone)}, but no order was
                    generated for this flight. This happens when its departure airport has no warehouse.
                  </div>
                )}

                {selectedStatus === 'void' && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <strong>This flight is cancelled.</strong> The catering order was voided. No transfers will be made.
                    </AlertDescription>
                  </Alert>
                )}

                {selectedOrder && selectedStatus !== 'ordering_open' && selectedStatus !== 'void' && (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Cabin</TableHead>
                          <TableHead className="text-right">Required</TableHead>
                          <TableHead className="text-right">In warehouse</TableHead>
                          <TableHead className="text-right">Shortfall</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupByCabin(selectedOrder.lines).flatMap((group) =>
                          group.lines.map((line) => {
                            const inWh =
                              line.quantityInWarehouse ??
                              batches
                                .filter((b) => b.warehouseId === selectedOrder.warehouseId && b.productId === line.productId)
                                .reduce((acc, b) => acc + b.quantityRemaining, 0)
                            const short = line.quantityShort
                            return (
                              <TableRow key={line.id}>
                                <TableCell className="font-medium">
                                  <span className="inline-flex flex-wrap items-center gap-2">
                                    {line.productName}
                                    {line.source === 'default' && <Badge variant="secondary">Default</Badge>}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{cabinLabel(line.cabin)}</Badge>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{formatQuantity(line.quantityRequired)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatQuantity(inWh)}</TableCell>
                                <TableCell className={cn('text-right tabular-nums', short > 0 && 'font-semibold text-destructive')}>
                                  {formatQuantity(short)}
                                </TableCell>
                              </TableRow>
                            )
                          }),
                        )}
                      </TableBody>
                    </Table>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>
                        {selectedOrder.lines.length} item{selectedOrder.lines.length === 1 ? '' : 's'} · {formatQuantity(totalUnits)} units
                        required
                      </span>
                      <span className={shortLineCount > 0 ? 'font-semibold text-destructive' : 'font-semibold text-green-700'}>
                        {shortLineCount > 0
                          ? `${shortLineCount} item${shortLineCount === 1 ? '' : 's'} short · ${formatQuantity(totalShort)} units`
                          : 'All items covered'}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

// The four stages of a catering order: where it is now, which are done.
function ProgressSteps({ status }: { status: UiStatus }) {
  if (status === 'no_order' || status === 'not_loaded') return null
  if (status === 'void') {
    return (
      <Alert variant="destructive">
        <AlertDescription>Void — catering order was cancelled</AlertDescription>
      </Alert>
    )
  }
  const steps: Array<{ key: string; label: string }> = [
    { key: 'ordering_open', label: 'Ordering open' },
    { key: 'order_ready', label: 'Order ready' },
    { key: 'loaded', label: 'Loaded' },
    { key: 'closed', label: 'Closed out' },
  ]
  const currentIdx = steps.findIndex((st) => st.key === status)
  return (
    <ol className="m-0 grid list-none grid-cols-4 gap-2 p-0" aria-label="Order progress">
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx
        const isActive = idx === currentIdx
        return (
          <li key={step.key} className="flex flex-col items-center gap-2" aria-current={isActive ? 'step' : undefined}>
            <span className={cn('h-1.5 w-full rounded-full', isDone || isActive ? 'bg-primary' : 'bg-muted')} aria-hidden="true" />
            <span className={cn('text-center text-xs', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// Use the type re-export to keep the import side effects happy.
type _StatusAlias = FlightCateringStatus
const _alias: _StatusAlias | null = null
void _alias
