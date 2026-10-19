// Flight Report page. Read-only summary of what was loaded onto the
// aircraft and what to do with the leftover. Live-computed remaining
// (red when negative) and a per-product "After the flight" preview
// that mirrors the spec's completion rules. Submit writes the
// flight_report + applies the rules to aircraft_stock + closes the
// catering order; the page then flips to the read-only view.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source or fires once on mount */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import { FlightReportApiError } from '@staff-web/features/onboard-products/api/errors'
import { Toast, useDialogFocusTrap, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import type { FlightReport, Product, ProductCategory, ProductSale } from '@staff-web/features/onboard-products/api/types'
import type { ReportableFlight } from '@staff-web/features/onboard-products/api/flight-report'
import styles from './FlightReportPage.module.css'

// -- helpers --------------------------------------------------------------

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

function formatQuantity(n: number): string {
  return n.toLocaleString('en-US')
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function categoryLabel(c: ProductCategory): string {
  if (c === 'meal') return 'Full meal'
  if (c === 'snack') return 'Light snack · sealed'
  if (c === 'beverage') return 'Beverage'
  return 'Duty-free'
}

function parseNonNegativeInt(s: string): number {
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function parseNonNegativeNumber(s: string): number {
  const n = parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

function getProductPrice(products: Product[], productId: string): number {
  return products.find((p) => p.id === productId)?.priceAmount ?? 0
}

// What the completion rules will do with the leftover stock for a
// product, given the current aircraft stock and its batch state.
interface AfterFlight {
  text: string
  kind: 'discarded' | 'carried' | 'kept'
  detail: string
}

function computeAfterFlight(category: ProductCategory, initial: number): AfterFlight {
  if (category === 'meal') {
    return {
      text: `Discarded: aircraft stock becomes 0 (${formatQuantity(initial)} thrown away)`,
      kind: 'discarded',
      detail: 'Meals cannot be carried over to the next flight.',
    }
  }
  if (category === 'snack') {
    return {
      text: `Carried over: ${formatQuantity(initial)} stay on board while the batch is valid`,
      kind: 'carried',
      detail: 'Sealed snacks stay on the aircraft while their batch is still valid.',
    }
  }
  return {
    text: `Kept: ${formatQuantity(initial)} stay in stock`,
    kind: 'kept',
    detail: category === 'beverage' ? 'Beverages stay on the aircraft as long as the batch is valid.' : 'Duty-free stays on the aircraft.',
  }
}

// Row shape used inside the page state. One per (flight, product).
interface UsageRow {
  productId: string
  productName: string
  category: ProductCategory
  initial: number
  sold: number
  served: number
  wasted: number
  damaged: number
  // Cached preview state for the right-most column.
  after: AfterFlight
}

function buildUsageRows(
  products: Product[],
  aircraftRows: Array<{ productId: string; quantity: number }>,
  sales: ProductSale[],
  report: FlightReport | null,
): UsageRow[] {
  const rows: UsageRow[] = []
  const byProduct = new Map<string, number>()
  for (const r of aircraftRows) {
    byProduct.set(r.productId, (byProduct.get(r.productId) ?? 0) + r.quantity)
  }
  const soldByProduct = new Map<string, number>()
  for (const s of sales) {
    soldByProduct.set(s.productId, (soldByProduct.get(s.productId) ?? 0) + s.quantity)
  }
  for (const [productId, initial] of byProduct) {
    const product = products.find((p) => p.id === productId)
    if (!product) continue
    const saved = report?.lines.find((l) => l.productId === productId)
    const sold = soldByProduct.get(productId) ?? 0
    const initialClamped = Math.max(0, initial)
    rows.push({
      productId,
      productName: product.name,
      category: product.category,
      initial: initialClamped,
      sold,
      served: saved?.served ?? 0,
      wasted: saved?.wasted ?? 0,
      damaged: saved?.damaged ?? 0,
      after: computeAfterFlight(product.category, initialClamped),
    })
  }
  // Sort: meals first, then snack, beverage, duty-free, then by name.
  const order: ProductCategory[] = ['meal', 'snack', 'beverage', 'duty_free']
  rows.sort((a, b) => {
    const ai = order.indexOf(a.category)
    const bi = order.indexOf(b.category)
    if (ai !== bi) return ai - bi
    return a.productName.localeCompare(b.productName)
  })
  return rows
}

function emptyInputs(rows: UsageRow[]): Record<string, { served: string; wasted: string; damaged: string }> {
  const out: Record<string, { served: string; wasted: string; damaged: string }> = {}
  for (const r of rows) {
    out[r.productId] = { served: String(r.served), wasted: String(r.wasted), damaged: String(r.damaged) }
  }
  return out
}

// -- component ------------------------------------------------------------

export function FlightReportPage() {
  const search = useSearch({ from: '/_authenticated/catering/flight-report' }) as { flightId?: string }
  const api = useOnboardApi()

  const [flights, setFlights] = useState<ReportableFlight[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [aircraftId, setAircraftId] = useState<string | null>(null)
  const [report, setReport] = useState<FlightReport | null>(null)
  const [sales, setSales] = useState<ProductSale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [rows, setRows] = useState<UsageRow[]>([])
  const [inputs, setInputs] = useState<Record<string, { served: string; wasted: string; damaged: string }>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [busy, setBusy] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  // Sale being edited, or null when the dialog is closed or in "add" mode.
  const [editingSale, setEditingSale] = useState<ProductSale | null>(null)
  // Sale pending a delete confirm, or null when the confirm dialog is closed.
  const [confirmDelete, setConfirmDelete] = useState<ProductSale | null>(null)
  const [recordProductId, setRecordProductId] = useState<string>('')
  const [recordQty, setRecordQty] = useState<string>('1')
  const [recordUnitPrice, setRecordUnitPrice] = useState<string>('0')
  const [recordError, setRecordError] = useState<string | null>(null)
  const [recordBusy, setRecordBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  // The record/edit dialog is open in either mode. The confirm-delete
  // dialog is tracked separately and uses its own focus-trap ref.
  const dialogIsOpen = recordOpen || editingSale != null
  useDialogFocusTrap(dialogIsOpen, dialogRef, () => {
    setRecordOpen(false)
    setEditingSale(null)
  })
  useDialogFocusTrap(confirmDelete != null, confirmRef, () => setConfirmDelete(null))

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  // Initial load: list reportable flights, preselect from URL or first.
  useEffect(() => {
    let cancelled = false
    api.flightReport
      .listReportableFlights()
      .then(async (data) => {
        if (cancelled) return
        setFlights(data)
        const initial = search.flightId != null ? (data.find((f) => f.id === search.flightId) ?? data[0]) : data[0]
        setSelectedId(initial?.id ?? null)
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

  // Load products once. Used by `getProductPrice` and category lookups.
  useEffect(() => {
    let cancelled = false
    api.products
      .list()
      .then((data) => {
        if (cancelled) return
        setProducts(data)
      })
      .catch(() => {
        // Non-fatal: prices and categories fall back to zero/'meal'.
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // Load the selected flight's report + sales + aircraft stock.
  useEffect(() => {
    if (selectedId == null) return
    let cancelled = false
    setLoading(true)
    const flight = flights.find((f) => f.id === selectedId)
    const aId = flight?.aircraftId ?? null
    setAircraftId(aId)
    Promise.all([
      api.flightReport.getFlightReport(selectedId),
      api.flightReport.listFlightSales(selectedId),
      aId != null
        ? api.flightReport.getAircraftStock(aId).then((rows) => rows.map((r) => ({ productId: r.productId, quantity: r.quantity })))
        : Promise.resolve([] as Array<{ productId: string; quantity: number }>),
    ])
      .then(async ([reportData, salesData, stockData]) => {
        if (cancelled) return
        setReport(reportData)
        setSales(salesData)
        const built = buildUsageRows(products, stockData, salesData, reportData)
        setRows(built)
        setInputs(emptyInputs(built))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Could not load the flight report.'
        setLoadError(message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, flights, api, products])

  async function refreshAfterMutation() {
    if (selectedId == null) return
    const [reportData, salesData, stockData] = await Promise.all([
      api.flightReport.getFlightReport(selectedId),
      api.flightReport.listFlightSales(selectedId),
      aircraftId != null
        ? api.flightReport.getAircraftStock(aircraftId).then((rows) => rows.map((r) => ({ productId: r.productId, quantity: r.quantity })))
        : Promise.resolve([] as Array<{ productId: string; quantity: number }>),
    ])
    setReport(reportData)
    setSales(salesData)
    const built = buildUsageRows(products, stockData, salesData, reportData)
    setRows(built)
    setInputs(emptyInputs(built))
  }

  async function handleRefreshFlights() {
    const data = await api.flightReport.listReportableFlights()
    setFlights(data)
  }

  // -- handlers ---------------------------------------------------------

  function onSelectFlight(id: string) {
    setSelectedId(id)
  }

  function setInput(productId: string, field: 'served' | 'wasted' | 'damaged', value: string) {
    setInputs((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }))
  }

  function handleReset() {
    setInputs(emptyInputs(rows))
  }

  async function handleSubmit() {
    if (selectedId == null) return
    setBusy(true)
    try {
      const lines = rows.map((r) => ({
        productId: r.productId,
        served: parseNonNegativeInt(inputs[r.productId]?.served ?? '0'),
        wasted: parseNonNegativeInt(inputs[r.productId]?.wasted ?? '0'),
        damaged: parseNonNegativeInt(inputs[r.productId]?.damaged ?? '0'),
      }))
      const result = await api.flightReport.submitFlightReportApi({ flightId: selectedId, lines })
      setReport(result)
      showToast('success', 'Report submitted. Aircraft stock is updated and the catering order is closed.')
      await refreshAfterMutation()
      await handleRefreshFlights()
    } catch (err) {
      if (err instanceof FlightReportApiError) {
        showToast('error', err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not submit the report.'
        showToast('error', message)
      }
    } finally {
      setBusy(false)
    }
  }

  function openRecordDialog() {
    if (rows.length === 0) {
      showToast('error', 'No products are loaded on this flight yet.')
      return
    }
    const first = rows[0]
    setEditingSale(null)
    setRecordProductId(first.productId)
    setRecordQty('1')
    setRecordUnitPrice(String(getProductPrice(products, first.productId)))
    setRecordError(null)
    setRecordOpen(true)
  }

  function openEditDialog(sale: ProductSale) {
    setRecordOpen(false)
    setEditingSale(sale)
    setRecordProductId(sale.productId)
    setRecordQty(String(sale.quantity))
    setRecordUnitPrice(String(sale.unitPriceAmount))
    setRecordError(null)
  }

  function openDeleteConfirm(sale: ProductSale) {
    setConfirmDelete(sale)
  }

  async function handleSaveSale() {
    if (selectedId == null) return
    setRecordBusy(true)
    setRecordError(null)
    try {
      const qty = parseNonNegativeInt(recordQty)
      if (qty <= 0) {
        setRecordError('Quantity must be greater than zero.')
        return
      }
      const unitPrice = parseNonNegativeNumber(recordUnitPrice)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setRecordError('Unit price must be 0 or more.')
        return
      }
      if (editingSale) {
        await api.flightReport.updateFlightSaleApi(editingSale.id, { quantity: qty, unitPriceAmount: unitPrice })
        showToast('success', 'Sale updated.')
      } else {
        await api.flightReport.createFlightSaleApi({
          flightId: selectedId,
          productId: recordProductId,
          quantity: qty,
          unitPriceAmount: unitPrice,
        })
        showToast('success', 'Sale recorded.')
      }
      setRecordOpen(false)
      setEditingSale(null)
      await refreshAfterMutation()
    } catch (err) {
      if (err instanceof FlightReportApiError) {
        setRecordError(err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not save the sale.'
        setRecordError(message)
      }
    } finally {
      setRecordBusy(false)
    }
  }

  async function handleConfirmDelete() {
    if (confirmDelete == null) return
    const id = confirmDelete.id
    setConfirmDelete(null)
    try {
      await api.flightReport.deleteFlightSaleApi(id)
      showToast('success', 'Sale removed.')
      await refreshAfterMutation()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the sale.'
      showToast('error', message)
    }
  }

  // -- derived state ---------------------------------------------------

  const submitted = report?.status === 'submitted'

  const lineIssues = useMemo(() => {
    if (rows.length === 0) return [] as Array<{ productId: string; remaining: number }>
    return rows.map((r) => {
      const served = parseNonNegativeInt(inputs[r.productId]?.served ?? '0')
      const wasted = parseNonNegativeInt(inputs[r.productId]?.wasted ?? '0')
      const damaged = parseNonNegativeInt(inputs[r.productId]?.damaged ?? '0')
      return {
        productId: r.productId,
        remaining: r.initial - served - r.sold - wasted - damaged,
      }
    })
  }, [rows, inputs])

  const hasMismatch = lineIssues.some((l) => l.remaining < 0)
  const mismatchMessage = useMemo(() => {
    const bad = lineIssues.filter((l) => l.remaining < 0)
    if (bad.length === 0) return null
    return bad
      .map((l) => {
        const row = rows.find((r) => r.productId === l.productId)
        return `${row?.productName ?? l.productId}: remaining would be ${l.remaining} (REPORT_MISMATCH)`
      })
      .join(' · ')
  }, [lineIssues, rows])

  const salesTotal = useMemo(() => sales.reduce((acc, s) => acc + s.totalAmount, 0), [sales])
  const salesItems = useMemo(() => sales.reduce((acc, s) => acc + s.quantity, 0), [sales])
  // Cost and margin are only meaningful after submit, when unit_cost_amount
  // is filled. Before submit, every sale has unitCostAmount === null.
  const hasAnyCost = sales.some((s) => s.unitCostAmount != null)
  const salesCost = useMemo(() => {
    if (!hasAnyCost) return 0
    return sales.reduce((acc, s) => {
      if (s.unitCostAmount == null) return acc
      return acc + s.unitCostAmount * s.quantity
    }, 0)
  }, [sales, hasAnyCost])
  const salesMargin = useMemo(() => {
    if (!hasAnyCost) return 0
    return sales.reduce((acc, s) => {
      if (s.unitCostAmount == null) return acc
      return acc + (s.unitPriceAmount - s.unitCostAmount) * s.quantity
    }, 0)
  }, [sales, hasAnyCost])

  // -- render -----------------------------------------------------------

  if (loadError) {
    return (
      <p className={styles.errorMessage} role="alert">
        {loadError}
      </p>
    )
  }

  const selectedFlight = flights.find((f) => f.id === selectedId) ?? null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Flight Report</h1>
          <p className={styles.subtitle}>
            Report what was served, sold, wasted and damaged. This is a flight total, not a passenger history.
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.policyChip}>Policy · Complimentary, 1 meal each</span>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <div className={styles.pickerBar} role="tablist" aria-label="Reportable flights">
        {flights.map((f) => {
          const active = f.id === selectedId
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${styles.pickerChip} ${active ? styles.pickerChipActive : ''}`}
              onClick={() => onSelectFlight(f.id)}
            >
              <div className={styles.pickerChipTop}>
                <span className={styles.pickerChipCode}>{f.flightNumber}</span>
                {f.reportSubmitted && <span className={styles.pickerChipSubmitted}>Submitted</span>}
              </div>
              <span className={styles.pickerChipRoute}>
                {f.departureAirport} → {f.arrivalAirport}
              </span>
              <span className={styles.pickerChipMeta}>{formatDateTime(f.scheduledDeparture)}</span>
            </button>
          )
        })}
        {flights.length === 0 && !loading && <p className={styles.message}>No flights are ready to report on yet.</p>}
      </div>

      {selectedFlight && (
        <section className={styles.detailCard} aria-label="Flight report detail">
          <div className={styles.detailHeader}>
            <h2 className={styles.cardTitle}>
              {selectedFlight.flightNumber} · {selectedFlight.departureAirport} → {selectedFlight.arrivalAirport}
            </h2>
            <p className={styles.detailSubtitle}>
              aircraft {selectedFlight.aircraftId.toUpperCase()} · {formatDateTime(selectedFlight.scheduledDeparture)}
            </p>
          </div>

          <h3 className={styles.cardTitle} style={{ fontSize: 18, marginTop: 12 }}>
            Usage by product
          </h3>
          <p className={styles.cardSubtitle}>
            Meals sold on board are paid through F5 first. A sale is recorded only after F5 reports paid.
          </p>

          {submitted && (
            <div className={styles.submittedBanner} role="status">
              Report submitted. Aircraft stock is updated and the catering order is closed.
            </div>
          )}

          {!submitted && rows.length === 0 && (
            <p className={styles.message}>
              {loading ? 'Loading…' : 'No products are loaded on this flight yet. Transfer stock from the catering order first.'}
            </p>
          )}

          {rows.length > 0 && (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.usageTable}>
                  <colgroup>
                    <col />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 100 }} />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="numeric">Initial</th>
                      <th className="numeric">Served</th>
                      <th className="numeric">Sold</th>
                      <th className="numeric">Wasted</th>
                      <th className="numeric">Damaged</th>
                      <th className="numeric">Remaining</th>
                      <th>After the flight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const served = parseNonNegativeInt(inputs[r.productId]?.served ?? '0')
                      const wasted = parseNonNegativeInt(inputs[r.productId]?.wasted ?? '0')
                      const damaged = parseNonNegativeInt(inputs[r.productId]?.damaged ?? '0')
                      const remaining = r.initial - served - r.sold - wasted - damaged
                      const short = remaining < 0
                      return (
                        <tr key={r.productId} className={short ? styles.shortRow : ''}>
                          <td>
                            <div className={styles.itemCell}>
                              <span className={styles.itemName}>{r.productName}</span>
                              <span className={styles.itemCategory}>{categoryLabel(r.category)}</span>
                            </div>
                          </td>
                          <td className="numeric">{formatQuantity(r.initial)}</td>
                          <td className="numeric">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              className={`${styles.numInput} ${short ? styles.numInputShort : ''}`}
                              value={inputs[r.productId]?.served ?? '0'}
                              onChange={(e) => setInput(r.productId, 'served', e.target.value)}
                              disabled={submitted || busy}
                              aria-label={`${r.productName} served`}
                            />
                          </td>
                          <td className="numeric">{formatQuantity(r.sold)}</td>
                          <td className="numeric">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              className={`${styles.numInput} ${short ? styles.numInputShort : ''}`}
                              value={inputs[r.productId]?.wasted ?? '0'}
                              onChange={(e) => setInput(r.productId, 'wasted', e.target.value)}
                              disabled={submitted || busy}
                              aria-label={`${r.productName} wasted`}
                            />
                          </td>
                          <td className="numeric">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              className={`${styles.numInput} ${short ? styles.numInputShort : ''}`}
                              value={inputs[r.productId]?.damaged ?? '0'}
                              onChange={(e) => setInput(r.productId, 'damaged', e.target.value)}
                              disabled={submitted || busy}
                              aria-label={`${r.productName} damaged`}
                            />
                          </td>
                          <td className={`numeric ${styles.remainingCell} ${short ? styles.remainingShort : ''}`}>
                            {formatQuantity(remaining)}
                          </td>
                          <td>
                            <span
                              className={`${styles.afterCell} ${
                                r.after.kind === 'discarded'
                                  ? styles.afterDiscarded
                                  : r.after.kind === 'carried'
                                    ? styles.afterCarried
                                    : styles.afterKept
                              }`}
                            >
                              {r.after.text}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {!submitted && hasMismatch && (
                <div className={styles.mismatchBanner} role="alert">
                  {mismatchMessage}
                </div>
              )}

              <div className={styles.actionRow}>
                {!submitted ? (
                  <>
                    <button
                      type="button"
                      className={styles.submitButton}
                      onClick={() => void handleSubmit()}
                      disabled={busy || hasMismatch}
                    >
                      Submit flight report
                    </button>
                    <button type="button" className={styles.resetButton} onClick={handleReset} disabled={busy}>
                      Reset
                    </button>
                  </>
                ) : (
                  <span className={styles.submittedBadge}>Submitted · {report?.submittedAt ? formatDateTime(report.submittedAt) : ''}</span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {selectedFlight && (
        <section className={styles.detailCard} aria-label="Sales on this flight">
          <div className={styles.salesHeader}>
            <div>
              <h2 className={styles.cardTitle}>Sales on this flight</h2>
              <p className={styles.cardSubtitle}>Totals from the sold column, at the selling price. Margin uses the batch purchase cost.</p>
            </div>
            <button
              type="button"
              className={styles.recordButton}
              onClick={openRecordDialog}
              disabled={submitted}
              title={submitted ? 'This flight has been reported; no more sales can be recorded.' : undefined}
            >
              + Record on-board sale
            </button>
          </div>

          {sales.length === 0 ? (
            <p className={styles.salesEmpty}>No on-board sales recorded for this flight yet.</p>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.salesTable}>
                  <colgroup>
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="numeric">Quantity</th>
                      <th className="numeric">Unit price</th>
                      <th className="numeric">Unit cost</th>
                      <th className="numeric">Total</th>
                      <th className={styles.actionsCol}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td>{s.productName}</td>
                        <td className="numeric">{formatQuantity(s.quantity)}</td>
                        <td className="numeric">{formatMoney(s.unitPriceAmount)}</td>
                        <td className="numeric">{s.unitCostAmount == null ? '—' : formatMoney(s.unitCostAmount)}</td>
                        <td className="numeric">{formatMoney(s.totalAmount)}</td>
                        <td className={styles.actionsCol}>
                          <div className={styles.salesActions}>
                            <button
                              type="button"
                              className={styles.salesActionButton}
                              onClick={() => openEditDialog(s)}
                              disabled={submitted}
                              aria-label={`Edit sale of ${s.productName}`}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.salesActionButton} ${styles.salesActionRemove}`}
                              onClick={() => openDeleteConfirm(s)}
                              disabled={submitted}
                              aria-label={`Remove sale of ${s.productName}`}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.salesTotals}>
                <div className={styles.totalCard}>
                  <p className={styles.totalLabel}>Items sold</p>
                  <p className={styles.totalValue}>{formatQuantity(salesItems)}</p>
                </div>
                <div className={styles.totalCard}>
                  <p className={styles.totalLabel}>Sales</p>
                  <p className={styles.totalValue}>{formatMoney(salesTotal)}</p>
                </div>
                <div className={styles.totalCard}>
                  <p className={styles.totalLabel}>Cost</p>
                  <p className={styles.totalValue}>{hasAnyCost ? formatMoney(salesCost) : '—'}</p>
                </div>
                <div className={`${styles.totalCard} ${styles.totalCardHighlight}`}>
                  <p className={`${styles.totalLabel} ${styles.totalLabelHighlight}`}>Gross margin</p>
                  <p className={`${styles.totalValue} ${styles.totalValueHighlight}`}>{hasAnyCost ? formatMoney(salesMargin) : '—'}</p>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {dialogIsOpen && (
        <div
          className={styles.dialogOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={editingSale ? 'Edit on-board sale' : 'Record on-board sale'}
        >
          <div className={styles.dialog} ref={dialogRef}>
            <h3 className={styles.dialogTitle}>{editingSale ? 'Edit on-board sale' : 'Record on-board sale'}</h3>
            <p className={styles.dialogSubtitle}>
              {editingSale
                ? 'Update the quantity or unit price for this sale.'
                : 'Pick a product loaded on this flight, set the selling price and the quantity sold.'}
            </p>
            {recordError && <div className={styles.dialogError}>{recordError}</div>}
            <div className={styles.dialogRow}>
              <label className={styles.dialogLabel} htmlFor="record-product">
                Product
              </label>
              <select
                id="record-product"
                className={styles.dialogSelect}
                value={recordProductId}
                onChange={(e) => setRecordProductId(e.target.value)}
                disabled={recordBusy || editingSale != null}
              >
                {rows.map((r) => (
                  <option key={r.productId} value={r.productId}>
                    {r.productName}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.dialogRow}>
              <label className={styles.dialogLabel} htmlFor="record-unit-price">
                Unit price
              </label>
              <input
                id="record-unit-price"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                className={styles.dialogInput}
                value={recordUnitPrice}
                onChange={(e) => setRecordUnitPrice(e.target.value)}
                disabled={recordBusy}
              />
            </div>
            <div className={styles.dialogRow}>
              <label className={styles.dialogLabel} htmlFor="record-qty">
                Quantity
              </label>
              <input
                id="record-qty"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                className={styles.dialogInput}
                value={recordQty}
                onChange={(e) => setRecordQty(e.target.value)}
                disabled={recordBusy}
              />
            </div>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.resetButton}
                onClick={() => {
                  setRecordOpen(false)
                  setEditingSale(null)
                }}
                disabled={recordBusy}
              >
                Cancel
              </button>
              <button type="button" className={styles.submitButton} onClick={() => void handleSaveSale()} disabled={recordBusy}>
                {editingSale ? 'Save changes' : 'Record sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete != null && (
        <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-label="Remove sale">
          <div className={styles.dialog} ref={confirmRef}>
            <h3 className={styles.dialogTitle}>Remove this sale?</h3>
            <p className={styles.dialogSubtitle}>
              {formatQuantity(confirmDelete.quantity)} × {confirmDelete.productName} at {formatMoney(confirmDelete.unitPriceAmount)} will be
              removed from this flight.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.resetButton} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.submitButton} ${styles.submitButtonDanger}`}
                onClick={() => void handleConfirmDelete()}
              >
                Remove sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
