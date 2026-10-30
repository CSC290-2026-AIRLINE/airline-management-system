// Catering Orders master-detail page.
// Left: a list of upcoming flights with search and filters. Right: the
// selected flight's catering order (progress bar, key facts, banner,
// lines table, action buttons).
// Reuses the shared Toast, the Stock page's select/card patterns, and
// the shared stock store. No "Simulated today" badge.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { CateringApiError, useOnboardApi } from '@staff-web/features/onboard-products/api'
import { ConfirmDialog, Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import type {
  Cabin,
  CateringOrder,
  CateringOrderLine,
  Flight,
  FlightCateringStatus,
  StockBatch,
  Warehouse,
} from '@staff-web/features/onboard-products/api/types'
import styles from './CateringOrdersPage.module.css'

// -- helpers ---------------------------------------------------------------

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

function formatQuantity(n: number): string {
  return n.toLocaleString('en-US')
}

const CABIN_ORDER: Cabin[] = ['economy', 'premium_economy', 'business', 'first']

function cabinLabel(c: Cabin | 'all'): string {
  if (c === 'economy') return 'Economy'
  if (c === 'premium_economy') return 'Premium economy'
  if (c === 'business') return 'Business'
  if (c === 'first') return 'First'
  return 'All cabins'
}

// Build the derived UI status used by the right-card title and the
// progress bar. Distinct from Flight.status so we can say
// "Ordering open" / "Order ready" / "Loaded" / "Closed out" / "Void".
type UiStatus = 'ordering_open' | 'order_ready' | 'loaded' | 'closed' | 'void'

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
  if (order) {
    if (order.status === 'closed') return 'closed'
    if (order.status === 'loaded') return 'loaded'
    if (order.status === 'void') return 'void'
    return 'order_ready'
  }
  return flightStatusToUi(flight.status)
}

function uiStatusLabel(s: UiStatus): string {
  if (s === 'ordering_open') return 'Ordering open'
  if (s === 'order_ready') return 'Order ready'
  if (s === 'loaded') return 'Loaded'
  if (s === 'closed') return 'Closed out'
  return 'Void'
}

function chipClass(s: UiStatus): string {
  if (s === 'ordering_open') return styles.chipOpen
  if (s === 'order_ready') return styles.chipReady
  if (s === 'loaded') return styles.chipLoaded
  if (s === 'closed') return styles.chipClosed
  return styles.chipVoid
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
type PendingAction = 'transfer' | 'close'

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
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [pageSize, setPageSize] = useState(8)
  const [searchText, setSearchText] = useState('')
  const [airportFilter, setAirportFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
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
            if (o) {
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
        if (o) {
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

  async function handleCloseOut() {
    if (selectedId == null) return
    setBusy(true)
    try {
      const order = await api.orders.closeCateringOrderApi(selectedId)
      setOrders((prev) => ({ ...prev, [selectedId]: order }))
      await refreshFlights()
      showToast('success', 'Catering order closed out.')
    } catch (err) {
      if (err instanceof CateringApiError) {
        showToast('error', err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not close out the order.'
        showToast('error', message)
      }
    } finally {
      setBusy(false)
      setPendingAction(null)
    }
  }

  // Run the action the open dialog is waiting for.
  function confirmPendingAction() {
    if (pendingAction === 'transfer') void handleTransfer()
    else if (pendingAction === 'close') void handleCloseOut()
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
    if (pendingAction === 'close') {
      return {
        title: 'Close out this catering order?',
        body: `The catering order for ${flightNumber} is marked as closed out. It cannot be reopened.`,
        confirmLabel: 'Close out',
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
      <p className={styles.errorMessage} role="alert">
        {loadError}
      </p>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Catering Orders</h1>
          <p className={styles.subtitle}>
            What each flight needs once ordering closes, checked against the warehouse before you load it. Transfer to the aircraft when the
            items are covered, or refresh the order after receiving more stock.
          </p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

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

      <div className={styles.layout}>
        {/* Left list --------------------------------------------------------- */}
        <section className={styles.listCard} aria-label="Flights">
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>Flights</h2>
            <span className={styles.listCount}>
              {filteredFlights.length} of {flights.length}
            </span>
          </div>

          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search flight or route"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setPageSize(8)
            }}
            aria-label="Search flights"
          />

          <div className={styles.filtersRow}>
            <select
              className={styles.filterSelect}
              value={airportFilter}
              onChange={(e) => {
                setAirportFilter(e.target.value)
                setPageSize(8)
              }}
              aria-label="Airport filter"
            >
              <option value="all">All airports</option>
              {airports.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPageSize(8)
              }}
              aria-label="Status filter"
            >
              <option value="all">Any status</option>
              <option value="ordering_open">Ordering open</option>
              <option value="order_ready">Order ready</option>
              <option value="loaded">Loaded</option>
              <option value="closed">Closed out</option>
              <option value="void">Void</option>
            </select>
          </div>

          {loading ? (
            <p className={styles.emptyList}>Loading flights…</p>
          ) : visibleFlights.length === 0 ? (
            <p className={styles.emptyList}>No flights match these filters.</p>
          ) : (
            <div className={styles.flightList}>
              {visibleFlights.map((f) => {
                const o = orders[f.id] ?? null
                const ui = uiStatus(f, o)
                const active = f.id === selectedId
                const oShort = o ? o.lines.filter(lineIsShort).length : 0
                const chipUi: UiStatus = oShort > 0 && ui === 'order_ready' ? 'order_ready' : ui
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`${styles.flightButton} ${active ? styles.flightButtonActive : ''}`}
                    onClick={() => onSelectFlight(f.id)}
                  >
                    <div className={styles.flightTopRow}>
                      <span className={styles.flightNumber}>{f.flightNumber}</span>
                      <span className={`${styles.chip} ${chipClass(chipUi)}`}>
                        {oShort > 0 && ui === 'order_ready' ? 'Short' : uiStatusLabel(ui)}
                      </span>
                    </div>
                    <span className={styles.flightRoute}>
                      {f.departureAirport} → {f.arrivalAirport}
                    </span>
                    <span className={styles.flightMeta}>
                      <span>{formatDateTime(f.scheduledDeparture)}</span>
                      <span>{f.passengerCount} pax</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {canShowMore && (
            <button type="button" className={styles.showMoreButton} onClick={() => setPageSize((n) => n + 10)} disabled={loading}>
              Show 10 more
            </button>
          )}
        </section>

        {/* Right detail ------------------------------------------------------ */}
        <section className={styles.rightCard} aria-label="Catering order details">
          {!selectedFlight || !selectedStatus ? (
            <p className={styles.emptyList}>Pick a flight on the left to see the catering order.</p>
          ) : (
            <>
              <div className={styles.rightHeader}>
                <div>
                  <h2 className={styles.flightTitle}>
                    {selectedFlight.flightNumber} · {selectedFlight.departureAirport} → {selectedFlight.arrivalAirport}
                  </h2>
                  <p className={styles.flightSubtitle}>Catering order for this flight</p>
                </div>
                <div className={styles.rightActions}>
                  <RefreshButton status={selectedStatus} busy={busy} onClick={handleRefresh} styles={styles} />
                  <TransferButton
                    status={selectedStatus}
                    shortCount={shortLineCount}
                    busy={busy}
                    onClick={() => setPendingAction('transfer')}
                    styles={styles}
                  />
                  <CloseOutButton status={selectedStatus} busy={busy} onClick={() => setPendingAction('close')} styles={styles} />
                </div>
              </div>

              <ProgressBar status={selectedStatus} styles={styles} />

              <div className={styles.factsRow}>
                <div className={styles.factCard}>
                  <p className={styles.factLabel}>Departs</p>
                  <p className={styles.factValue}>{formatDateTime(selectedFlight.scheduledDeparture)}</p>
                </div>
                <div className={styles.factCard}>
                  <p className={styles.factLabel}>Passengers</p>
                  <p className={styles.factValue}>{formatQuantity(selectedFlight.passengerCount)}</p>
                </div>
                <div className={styles.factCard}>
                  <p className={styles.factLabel}>Loads from</p>
                  <p className={styles.factValueSmall}>{selectedWarehouse ? selectedWarehouse.name : selectedFlight.warehouseId}</p>
                </div>
                <div className={styles.factCard}>
                  <p className={styles.factLabel}>Ordering closed</p>
                  <p className={styles.factValueSmall}>{formatDateTime(selectedFlight.cutoffAt)}</p>
                </div>
              </div>

              {selectedStatus === 'ordering_open' && (
                <div className={styles.banner + ' ' + styles.bannerNeutral}>
                  <span>
                    Ordering is open until {formatTime(selectedFlight.cutoffAt)} on {formatDateTime(selectedFlight.cutoffAt)}. The catering
                    order is generated automatically at the cutoff.
                  </span>
                </div>
              )}

              {selectedStatus === 'order_ready' && shortLineCount > 0 && selectedWarehouse && (
                <div className={styles.banner + ' ' + styles.bannerShort}>
                  <span>
                    {shortLineCount} item{shortLineCount === 1 ? '' : 's'} short in {selectedWarehouse.code} (STOCK_SHORTFALL). Receive a
                    delivery, then refresh the order.
                  </span>
                  <button
                    type="button"
                    className={styles.bannerButton}
                    onClick={() => void navigate({ to: '/catering/stock/receive', search: { airport: selectedWarehouse.code } })}
                  >
                    Receive delivery
                  </button>
                </div>
              )}

              {selectedStatus === 'ordering_open' && (
                <div className={styles.orderingOpenPanel}>
                  <strong>No lines yet</strong>
                  The catering order is generated automatically when ordering closes at {formatDateTime(selectedFlight.cutoffAt)}. Refresh
                  the page then.
                </div>
              )}

              {selectedStatus === 'void' && (
                <div className={styles.voidPanel}>
                  <strong>This flight is cancelled</strong>
                  The catering order was voided. No transfers will be made.
                </div>
              )}

              {selectedOrder && selectedStatus !== 'ordering_open' && selectedStatus !== 'void' && (
                <>
                  <div className={styles.tableWrap}>
                    <table className={styles.linesTable}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Cabin</th>
                          <th className="numeric">Required</th>
                          <th className="numeric">In warehouse</th>
                          <th className="numeric">Shortfall</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupByCabin(selectedOrder.lines).flatMap((group) =>
                          group.lines.map((line) => {
                            const inWh = batches
                              .filter((b) => b.warehouseId === selectedOrder.warehouseId && b.productId === line.productId)
                              .reduce((acc, b) => acc + b.quantityRemaining, 0)
                            const short = line.quantityShort
                            return (
                              <tr key={line.id} className={short > 0 ? styles.shortRow : ''}>
                                <td>
                                  {line.productName}
                                  {line.source === 'default' && <span className={styles.sourceBadge}>Default</span>}
                                </td>
                                <td>
                                  <span className={styles.cabinBadge}>{cabinLabel(line.cabin)}</span>
                                </td>
                                <td className="numeric">{formatQuantity(line.quantityRequired)}</td>
                                <td className="numeric">{formatQuantity(inWh)}</td>
                                <td className={'numeric ' + (short > 0 ? styles.shortValue : '')}>{formatQuantity(short)}</td>
                              </tr>
                            )
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.linesFooter}>
                    <span>
                      {selectedOrder.lines.length} item{selectedOrder.lines.length === 1 ? '' : 's'} · {formatQuantity(totalUnits)} units
                      required
                    </span>
                    <span className={shortLineCount > 0 ? styles.linesSummaryShort : styles.linesSummaryOk}>
                      {shortLineCount > 0
                        ? `${shortLineCount} item${shortLineCount === 1 ? '' : 's'} short · ${formatQuantity(totalShort)} units`
                        : 'All items covered'}
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// -- progress bar ----------------------------------------------------------

function ProgressBar({ status, styles }: { status: UiStatus; styles: typeof import('./CateringOrdersPage.module.css').default }) {
  if (status === 'void') {
    return <div className={styles.progressVoid}>Void — catering order was cancelled</div>
  }
  const steps: Array<{ key: string; label: string; idx: number }> = [
    { key: 'ordering_open', label: 'Ordering open', idx: 0 },
    { key: 'order_ready', label: 'Order ready', idx: 1 },
    { key: 'loaded', label: 'Loaded', idx: 2 },
    { key: 'closed', label: 'Closed out', idx: 3 },
  ]
  const currentIdx = steps.findIndex((s) => s.key === status)
  return (
    <div className={styles.progressRow} role="progressbar" aria-valuenow={currentIdx + 1} aria-valuemin={1} aria-valuemax={4}>
      <div className={styles.progressBar} />
      {steps.map((step) => {
        const isDone = step.idx < currentIdx
        const isActive = step.idx === currentIdx
        const dotClass = isActive ? styles.progressDotActive : isDone ? styles.progressDotDone : ''
        const labelClass = isActive
          ? `${styles.progressLabel} ${styles.progressLabelActive}`
          : isDone
            ? `${styles.progressLabel} ${styles.progressLabelDone}`
            : styles.progressLabel
        return (
          <div key={step.key} className={styles.progressStep}>
            <span className={`${styles.progressDot} ${dotClass}`} />
            <span className={labelClass}>{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// -- action buttons --------------------------------------------------------

function RefreshButton({
  status,
  busy,
  onClick,
  styles,
}: {
  status: UiStatus
  busy: boolean
  onClick: () => void
  styles: typeof import('./CateringOrdersPage.module.css').default
}) {
  // Regenerating the lines only makes sense before the transfer. The
  // backend rejects a refresh once the order is loaded or closed, so
  // the button is only offered at the order-ready stage.
  if (status !== 'order_ready') return null
  return (
    <button type="button" className={styles.actionButton} onClick={onClick} disabled={busy}>
      Refresh order
    </button>
  )
}

function TransferButton({
  status,
  shortCount,
  busy,
  onClick,
  styles,
}: {
  status: UiStatus
  shortCount: number
  busy: boolean
  onClick: () => void
  styles: typeof import('./CateringOrdersPage.module.css').default
}) {
  if (status === 'ordering_open' || status === 'void' || status === 'closed') return null
  if (status === 'loaded') {
    return (
      <button type="button" className={`${styles.actionButton} ${styles.actionPrimary}`} disabled>
        Loaded
      </button>
    )
  }
  // order_ready
  const short = shortCount > 0
  return (
    <>
      <button
        type="button"
        className={`${styles.actionButton} ${styles.actionPrimary}`}
        onClick={onClick}
        disabled={busy || short}
        title={short ? 'STOCK_SHORTFALL: receive stock first' : undefined}
      >
        Transfer to aircraft
      </button>
      {short && <span className={styles.shortHint}>STOCK_SHORTFALL — receive more stock first</span>}
    </>
  )
}

function CloseOutButton({
  status,
  busy,
  onClick,
  styles,
}: {
  status: UiStatus
  busy: boolean
  onClick: () => void
  styles: typeof import('./CateringOrdersPage.module.css').default
}) {
  if (status !== 'loaded') return null
  return (
    <button type="button" className={styles.actionButton} onClick={onClick} disabled={busy}>
      Close out
    </button>
  )
}

// Use the type re-export to keep the import side effects happy.
type _StatusAlias = FlightCateringStatus
const _alias: _StatusAlias | null = null
void _alias
