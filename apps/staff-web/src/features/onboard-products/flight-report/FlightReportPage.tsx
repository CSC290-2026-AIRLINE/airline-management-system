// Flight Report page. Read-only summary of what was loaded onto the
// aircraft and what to do with the leftover. Live-computed remaining
// (red when negative) and a per-product "After the flight" preview
// that mirrors the spec's completion rules. Submit writes the
// flight_report + applies the rules to aircraft_stock + closes the
// catering order; the page then flips to the read-only view.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source or fires once on mount */

import { useEffect, useMemo, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useOnboardApi } from '@staff-web/features/onboard-products/api'
import { FlightReportApiError } from '@staff-web/features/onboard-products/api/errors'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { PageHeader, StatCard } from '@staff-web/features/onboard-products/ui'
import type { FlightReport, Product, ProductCategory, ProductSale } from '@staff-web/features/onboard-products/api/types'
import type { FlightMealPolicy, ReportableFlight } from '@staff-web/features/onboard-products/api/flight-report'

// -- helpers --------------------------------------------------------------

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

// `left` is what remains after served, sold, wasted and damaged.
function computeAfterFlight(category: ProductCategory, left: number): AfterFlight {
  const initial = Math.max(0, left)
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

const CABIN_ORDER = ['economy', 'premium_economy', 'business', 'first']

function cabinName(cabin: string): string {
  const name = cabin.replace('_', ' ')
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// "Economy: paid · Business: complimentary, 1 meal each", from the flight's resolved cabin settings.
function mealPolicySummary(policy: FlightMealPolicy[]): string {
  return [...policy]
    .sort((a, b) => CABIN_ORDER.indexOf(a.cabin) - CABIN_ORDER.indexOf(b.cabin))
    .map((p) => {
      if (p.mealService === 'complimentary') return `${cabinName(p.cabin)}: complimentary, ${p.includedPerPassenger} meal each`
      if (p.mealService === 'paid') return `${cabinName(p.cabin)}: paid`
      return `${cabinName(p.cabin)}: no meal service`
    })
    .join(' · ')
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
}

function buildUsageRows(
  products: Product[],
  aircraftRows: Array<{ productId: string; quantity: number }>,
  sales: ProductSale[],
  report: FlightReport | null,
): UsageRow[] {
  const rows: UsageRow[] = []
  // A submitted report is shown as submitted: its own lines, with the numbers that were entered. The aircraft stock
  // no longer has the meals by then (they are discarded), so building from it would drop those rows.
  if (report?.status === 'submitted') {
    for (const line of report.lines) {
      const category = products.find((p) => p.id === line.productId)?.category ?? 'meal'
      rows.push({
        productId: line.productId,
        productName: line.productName,
        category,
        initial: line.initialQuantity,
        sold: line.sold,
        served: line.served,
        wasted: line.wasted,
        damaged: line.damaged,
      })
    }
    return sortRows(rows)
  }
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
    })
  }
  return sortRows(rows)
}

// Meals first, then snack, beverage, duty-free, then by name.
function sortRows(rows: UsageRow[]): UsageRow[] {
  const order: ProductCategory[] = ['meal', 'snack', 'beverage', 'duty_free']
  return rows.sort((a, b) => {
    const ai = order.indexOf(a.category)
    const bi = order.indexOf(b.category)
    if (ai !== bi) return ai - bi
    return a.productName.localeCompare(b.productName)
  })
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
  const [mealPolicy, setMealPolicy] = useState<FlightMealPolicy[]>([])
  const [inputs, setInputs] = useState<Record<string, { served: string; wasted: string; damaged: string }>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  // The record/edit dialog is open in either mode. The confirm-delete dialog is tracked separately.
  const dialogIsOpen = recordOpen || editingSale != null

  function showToast(kind: 'success' | 'error', message: string) {
    if (kind === 'success') toast.success(message)
    else toast.error(message)
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
    api.flightReport
      .getFlightMealPolicy(selectedId)
      .then((policy) => {
        if (!cancelled) setMealPolicy(policy)
      })
      .catch(() => {
        // Only the policy chip depends on it; the report still works.
        if (!cancelled) setMealPolicy([])
      })
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
        await api.flightReport.updateFlightSaleApi(selectedId, editingSale.id, { quantity: qty, unitPriceAmount: unitPrice })
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
    if (confirmDelete == null || selectedId == null) return
    const id = confirmDelete.id
    setConfirmDelete(null)
    try {
      await api.flightReport.deleteFlightSaleApi(selectedId, id)
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
      <Alert variant="destructive" role="alert">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  const selectedFlight = flights.find((f) => f.id === selectedId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Flight Report"
        description="Report what was served, sold, wasted and damaged. This is a flight total, not a passenger history."
        actions={
          selectedId && mealPolicy.length > 0 ? <Badge variant="outline">Policy · {mealPolicySummary(mealPolicy)}</Badge> : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tablist" aria-label="Reportable flights">
        {flights.map((f) => {
          const active = f.id === selectedId
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                'flex flex-col gap-1 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active && 'border-primary ring-1 ring-primary',
              )}
              onClick={() => onSelectFlight(f.id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{f.flightNumber}</span>
                {f.reportSubmitted && <Badge variant="secondary">Submitted</Badge>}
              </span>
              <span className="text-sm">
                {f.departureAirport} → {f.arrivalAirport}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(f.scheduledDeparture, f.departureTimeZone)}</span>
            </button>
          )
        })}
        {flights.length === 0 && !loading && <p className="m-0 text-sm text-muted-foreground">No flights are ready to report on yet.</p>}
      </div>

      {selectedFlight && (
        <Card className="gap-4" aria-label="Flight report detail">
          <CardHeader>
            <CardTitle className="text-xl">
              {selectedFlight.flightNumber} · {selectedFlight.departureAirport} → {selectedFlight.arrivalAirport}
            </CardTitle>
            <CardDescription>
              Aircraft {selectedFlight.aircraftTailNumber ?? selectedFlight.aircraftId} ·{' '}
              {formatDateTime(selectedFlight.scheduledDeparture, selectedFlight.departureTimeZone)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <h3 className="m-0 text-lg font-semibold">Usage by product</h3>
              <p className="m-0 text-sm text-muted-foreground">
                Meals sold on board are paid through F5 first. A sale is recorded only after F5 reports paid.
              </p>
            </div>

            {submitted && (
              <Alert role="status" className="border-green-200 bg-green-50 text-green-800">
                <AlertDescription className="text-green-800">
                  Report submitted. Aircraft stock is updated and the catering order is closed.
                </AlertDescription>
              </Alert>
            )}

            {!submitted && rows.length === 0 && (
              <p className="m-0 py-6 text-center text-sm text-muted-foreground">
                {loading ? 'Loading…' : 'No products are loaded on this flight yet. Transfer stock from the catering order first.'}
              </p>
            )}

            {rows.length > 0 && (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Initial</TableHead>
                      <TableHead className="w-20 text-right">Served</TableHead>
                      <TableHead className="text-right">Sold</TableHead>
                      <TableHead className="w-20 text-right">Wasted</TableHead>
                      <TableHead className="w-20 text-right">Damaged</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>After the flight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const served = parseNonNegativeInt(inputs[r.productId]?.served ?? '0')
                      const wasted = parseNonNegativeInt(inputs[r.productId]?.wasted ?? '0')
                      const damaged = parseNonNegativeInt(inputs[r.productId]?.damaged ?? '0')
                      const remaining = r.initial - served - r.sold - wasted - damaged
                      const short = remaining < 0
                      // The preview follows what is typed: it is about the quantity left, not the starting one.
                      const after = computeAfterFlight(r.category, remaining)
                      return (
                        <TableRow key={r.productId}>
                          <TableCell>
                            <span className="flex flex-col">
                              <span className="font-medium">{r.productName}</span>
                              <span className="text-xs text-muted-foreground">{categoryLabel(r.category)}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQuantity(r.initial)}</TableCell>
                          <TableCell>
                            <UsageInput
                              label={`${r.productName} served`}
                              value={inputs[r.productId]?.served ?? '0'}
                              onChange={(v) => setInput(r.productId, 'served', v)}
                              disabled={submitted || busy}
                              invalid={short}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQuantity(r.sold)}</TableCell>
                          <TableCell>
                            <UsageInput
                              label={`${r.productName} wasted`}
                              value={inputs[r.productId]?.wasted ?? '0'}
                              onChange={(v) => setInput(r.productId, 'wasted', v)}
                              disabled={submitted || busy}
                              invalid={short}
                            />
                          </TableCell>
                          <TableCell>
                            <UsageInput
                              label={`${r.productName} damaged`}
                              value={inputs[r.productId]?.damaged ?? '0'}
                              onChange={(v) => setInput(r.productId, 'damaged', v)}
                              disabled={submitted || busy}
                              invalid={short}
                            />
                          </TableCell>
                          <TableCell className={cn('text-right font-semibold tabular-nums', short && 'text-destructive')}>
                            {formatQuantity(remaining)}
                          </TableCell>
                          <TableCell className="min-w-48 whitespace-normal">
                            <span
                              className={cn(
                                'block text-sm',
                                after.kind === 'discarded'
                                  ? 'text-destructive'
                                  : after.kind === 'carried'
                                    ? 'text-foreground'
                                    : 'text-muted-foreground',
                              )}
                            >
                              {after.text}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {!submitted && hasMismatch && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{mismatchMessage}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!submitted ? (
                    <>
                      <Button type="button" onClick={() => void handleSubmit()} disabled={busy || hasMismatch}>
                        Submit flight report
                      </Button>
                      <Button type="button" variant="outline" onClick={handleReset} disabled={busy}>
                        Reset
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">
                      Submitted · {report?.submittedAt ? formatDateTime(report.submittedAt, selectedFlight?.departureTimeZone) : ''}
                    </Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {selectedFlight && (
        <Card className="gap-4" aria-label="Sales on this flight">
          <CardHeader>
            <CardTitle>Sales on this flight</CardTitle>
            <CardDescription>Totals from the sold column, at the selling price. Margin uses the batch purchase cost.</CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="outline"
                onClick={openRecordDialog}
                disabled={submitted}
                title={submitted ? 'This flight has been reported; no more sales can be recorded.' : undefined}
              >
                <Plus aria-hidden="true" />
                Record on-board sale
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sales.length === 0 ? (
              <p className="m-0 py-6 text-center text-sm text-muted-foreground">No on-board sales recorded for this flight yet.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-40">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantity(s.quantity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(s.unitPriceAmount)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {s.unitCostAmount == null ? '—' : formatMoney(s.unitCostAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(s.totalAmount)}</TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(s)}
                              disabled={submitted}
                              aria-label={`Edit sale of ${s.productName}`}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => openDeleteConfirm(s)}
                              disabled={submitted}
                              aria-label={`Remove sale of ${s.productName}`}
                            >
                              Remove
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Items sold" value={formatQuantity(salesItems)} />
                  <StatCard label="Sales" value={formatMoney(salesTotal)} />
                  <StatCard label="Cost" value={hasAnyCost ? formatMoney(salesCost) : '—'} />
                  <StatCard label="Gross margin" value={hasAnyCost ? formatMoney(salesMargin) : '—'} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialogIsOpen}
        onOpenChange={(open) => {
          if (!open && !recordBusy) {
            setRecordOpen(false)
            setEditingSale(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSale ? 'Edit on-board sale' : 'Record on-board sale'}</DialogTitle>
            <DialogDescription>
              {editingSale
                ? 'Update the quantity or unit price for this sale.'
                : 'Pick a product loaded on this flight, set the selling price and the quantity sold.'}
            </DialogDescription>
          </DialogHeader>
          {recordError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{recordError}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="record-product">Product</Label>
              <NativeSelect
                id="record-product"
                className="w-full"
                value={recordProductId}
                onChange={(e) => setRecordProductId(e.target.value)}
                disabled={recordBusy || editingSale != null}
              >
                {rows.map((r) => (
                  <NativeSelectOption key={r.productId} value={r.productId}>
                    {r.productName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="record-unit-price">Unit price</Label>
              <Input
                id="record-unit-price"
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                value={recordUnitPrice}
                onChange={(e) => setRecordUnitPrice(e.target.value)}
                disabled={recordBusy}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="record-qty">Quantity</Label>
              <Input
                id="record-qty"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={recordQty}
                onChange={(e) => setRecordQty(e.target.value)}
                disabled={recordBusy}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRecordOpen(false)
                setEditingSale(null)
              }}
              disabled={recordBusy}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveSale()} disabled={recordBusy}>
              {editingSale ? 'Save changes' : 'Record sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete != null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this sale?</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `${formatQuantity(confirmDelete.quantity)} × ${confirmDelete.productName} at ${formatMoney(confirmDelete.unitPriceAmount)} will be removed from this flight.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleConfirmDelete()}>
              Remove sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** A small number field for the served / wasted / damaged columns. */
function UsageInput({
  label,
  value,
  onChange,
  disabled,
  invalid,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  invalid: boolean
}) {
  return (
    <Input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      className="ml-auto w-16 px-2 text-right"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
    />
  )
}
