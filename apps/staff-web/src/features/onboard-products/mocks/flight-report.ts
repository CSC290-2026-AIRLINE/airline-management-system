// Mock data for the flight report screen. The store is module-level
// mutable so submit / record-sale results persist while the user
// navigates between pages, then reset on reload.
//
// Pre-seeded with three reportable flights:
//   - f-401: already submitted (read-only view).
//   - f-405: ready to report, with on-board sales (the flight that
//     trips REPORT_MISMATCH when the user types Served > initial).
//   - f-308: ready to report, mirrors the prototype's FY307 example.

import { MOCK_NOW_ISO } from './clock'
import { mockProducts } from './products'
import { discardAircraftStock, snapshotAircraftStock, snapshotStockBatches } from './stock'
import { closeCateringOrder, snapshotCateringOrders, snapshotFlight } from './orders'
import type { Flight, FlightReport, FlightReportLine, Product, ProductSale } from '../api/types'

// -- Stores ----------------------------------------------------------------

interface FlightReportStore {
  reports: Map<string, FlightReport>
  sales: ProductSale[]
}

const store: FlightReportStore = {
  reports: new Map(),
  sales: [],
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`
}

function cloneLine(line: FlightReportLine): FlightReportLine {
  return { ...line }
}

function productById(id: string): Product | undefined {
  return mockProducts.find((p) => p.id === id)
}

// -- Typed error -----------------------------------------------------------

export class FlightReportApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'FlightReportApiError'
  }
}

// -- Seed ------------------------------------------------------------------
// The seed runs once on module load. It is the data the Catering Orders
// transfer + Stock receive flows are not part of, so the Flight Report
// has something to report on without a manual setup step.

function makeLine(productId: string, initial: number, served: number, sold: number, wasted: number, damaged: number): FlightReportLine {
  return {
    id: nextId('frl'),
    productId,
    productName: productById(productId)?.name ?? productId,
    initialQuantity: initial,
    served,
    sold,
    wasted,
    damaged,
    remaining: Math.max(0, initial - served - sold - wasted - damaged),
  }
}

function seedOnce(): void {
  // f-401 — submitted, BKK → NRT, business cabin. Initial values match
  // the prototype's "FY307" example so the read-only view is rich.
  const f401Lines: FlightReportLine[] = [
    makeLine('p-002', 22, 18, 0, 4, 0),
    makeLine('p-004', 8, 7, 0, 1, 0),
    makeLine('p-009', 30, 0, 2, 0, 0),
  ]
  store.reports.set('f-401', {
    id: 'fr-f-401',
    flightId: 'f-401',
    flightNumber: 'FL401',
    route: 'BKK → NRT',
    status: 'submitted',
    submittedAt: MOCK_NOW_ISO,
    lines: f401Lines,
  })
  store.sales.push({
    id: nextId('ps'),
    flightId: 'f-401',
    productId: 'p-009',
    productName: 'Cold brew coffee',
    quantity: 2,
    unitPriceAmount: productById('p-009')?.priceAmount ?? 0,
    unitCostAmount: productById('p-009')?.purchaseCostAmount ?? null,
    totalAmount: 2 * (productById('p-009')?.priceAmount ?? 0),
    currency: 'USD',
    paymentId: 'f5-confirmed',
    soldAt: MOCK_NOW_ISO,
  })

  // f-308 — ready to report, BKK → NRT, economy. Mirrors the prototype.
  // No flight_report yet, but two on-board sales already exist.
  store.sales.push(
    {
      id: nextId('ps'),
      flightId: 'f-308',
      productId: 'p-002',
      productName: 'Braised beef, mash and greens',
      quantity: 6,
      unitPriceAmount: productById('p-002')?.priceAmount ?? 0,
      unitCostAmount: null,
      totalAmount: 6 * (productById('p-002')?.priceAmount ?? 0),
      currency: 'USD',
      paymentId: 'f5-confirmed',
      soldAt: MOCK_NOW_ISO,
    },
    {
      id: nextId('ps'),
      flightId: 'f-308',
      productId: 'p-008',
      productName: 'Mixed roasted nuts',
      quantity: 18,
      unitPriceAmount: productById('p-008')?.priceAmount ?? 0,
      unitCostAmount: null,
      totalAmount: 18 * (productById('p-008')?.priceAmount ?? 0),
      currency: 'USD',
      paymentId: 'f5-confirmed',
      soldAt: MOCK_NOW_ISO,
    },
  )

  // f-405 — ready to report, SIN → BKK, economy, 3 on-board sales of
  // p-009 (cold brew). The user will type Served for p-002 to
  // demonstrate REPORT_MISMATCH.
  store.sales.push({
    id: nextId('ps'),
    flightId: 'f-405',
    productId: 'p-009',
    productName: 'Cold brew coffee',
    quantity: 3,
    unitPriceAmount: productById('p-009')?.priceAmount ?? 0,
    unitCostAmount: null,
    totalAmount: 3 * (productById('p-009')?.priceAmount ?? 0),
    currency: 'USD',
    paymentId: 'f5-confirmed',
    soldAt: MOCK_NOW_ISO,
  })
}

seedOnce()

// -- Public snapshots ------------------------------------------------------

export function snapshotFlightReport(flightId: string): FlightReport | null {
  const r = store.reports.get(flightId)
  if (!r) return null
  return { ...r, lines: r.lines.map(cloneLine) }
}

export function snapshotFlightSales(flightId: string): ProductSale[] {
  return store.sales.filter((s) => s.flightId === flightId).map((s) => ({ ...s }))
}

// Total sold for a (flight, product) pair, derived from product_sale.
export function soldTotalFor(flightId: string, productId: string): number {
  let total = 0
  for (const s of store.sales) {
    if (s.flightId === flightId && s.productId === productId) total += s.quantity
  }
  return total
}

// Filter the flight list down to reportable ones (loaded or closed
// catering order) and join with whether a report has been submitted.
// Inlined here to keep the picker simple; the api layer uses this.
export interface ReportableFlight {
  id: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  aircraftId: string
  reportSubmitted: boolean
}

export function listReportableFlightsFromCache(flights: Flight[]): ReportableFlight[] {
  return flights
    .filter((f) => f.status === 'loaded' || f.status === 'closed')
    .map((f) => ({
      id: f.id,
      flightNumber: f.flightNumber,
      departureAirport: f.departureAirport,
      arrivalAirport: f.arrivalAirport,
      scheduledDeparture: f.scheduledDeparture,
      aircraftId: f.aircraftId,
      reportSubmitted: store.reports.has(f.id),
    }))
}

// -- Mutations -------------------------------------------------------------

// Look up the unit cost and batch validity of the earliest-expiring
// valid aircraft batch for a product. Used to fill product_sale.unit
// cost on submit, and to decide whether a snack/beverage batch is
// still valid for the completion rules.
export function earliestAircraftBatch(
  aircraftId: string,
  productId: string,
): {
  unitCostAmount: number
  expiresAt: string | null
  isDamaged: boolean
} | null {
  const rows = snapshotAircraftStock(aircraftId).filter((r) => r.productId === productId && r.quantity > 0)
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    if (a.expiresAt == null && b.expiresAt == null) return 0
    if (a.expiresAt == null) return 1
    if (b.expiresAt == null) return -1
    return a.expiresAt.localeCompare(b.expiresAt)
  })
  const chosen = sorted[0]
  const batch = snapshotStockBatches({}).find((b) => b.id === chosen.stockBatchId)
  return {
    unitCostAmount: batch?.unitCostAmount ?? productById(productId)?.purchaseCostAmount ?? 0,
    expiresAt: chosen.expiresAt,
    isDamaged: batch?.isDamaged ?? false,
  }
}

interface SubmitContext {
  flight: Flight
  aircraftId: string
  initialByProduct: Map<string, number>
  categories: Map<string, Product['category']>
}

function buildContext(flight: Flight): SubmitContext {
  const rows = snapshotAircraftStock(flight.aircraftId)
  const initialByProduct = new Map<string, number>()
  const categories = new Map<string, Product['category']>()
  for (const r of rows) {
    initialByProduct.set(r.productId, (initialByProduct.get(r.productId) ?? 0) + r.quantity)
    const p = productById(r.productId)
    if (p) categories.set(r.productId, p.category)
  }
  return { flight, aircraftId: flight.aircraftId, initialByProduct, categories }
}

export interface SubmitFlightReportInput {
  flightId: string
  aircraftId: string
  lines: Array<{ productId: string; served: number; wasted: number; damaged: number }>
}

export function submitFlightReport(input: SubmitFlightReportInput, flight: Flight): FlightReport {
  if (store.reports.has(input.flightId)) {
    throw new FlightReportApiError('REPORT_ALREADY_SUBMITTED', 'This flight already has a submitted report.')
  }
  const ctx: SubmitContext = buildContext(flight)

  // Validate every line; produce the report rows.
  const newLines: FlightReportLine[] = []
  for (const line of input.lines) {
    if (!Number.isInteger(line.served) || line.served < 0) {
      throw new FlightReportApiError('REPORT_INVALID', 'Served quantity must be a non-negative integer.')
    }
    if (!Number.isInteger(line.wasted) || line.wasted < 0) {
      throw new FlightReportApiError('REPORT_INVALID', 'Wasted quantity must be a non-negative integer.')
    }
    if (!Number.isInteger(line.damaged) || line.damaged < 0) {
      throw new FlightReportApiError('REPORT_INVALID', 'Damaged quantity must be a non-negative integer.')
    }
    const initial = ctx.initialByProduct.get(line.productId) ?? 0
    const sold = soldTotalFor(input.flightId, line.productId)
    const remaining = initial - line.served - sold - line.wasted - line.damaged
    if (remaining < 0) {
      const product = productById(line.productId)
      throw new FlightReportApiError(
        'REPORT_MISMATCH',
        `${product?.name ?? line.productId} remaining would be ${remaining} (served + sold + wasted + damaged exceeds initial).`,
      )
    }
    newLines.push({
      id: nextId('frl'),
      productId: line.productId,
      productName: productById(line.productId)?.name ?? line.productId,
      initialQuantity: initial,
      served: line.served,
      sold,
      wasted: line.wasted,
      damaged: line.damaged,
      remaining,
    })
  }

  // Fill unit_cost_amount on every sale for the flight using the
  // earliest-expiring aircraft batch.
  for (const sale of store.sales) {
    if (sale.flightId !== input.flightId) continue
    const lookup = earliestAircraftBatch(input.aircraftId, sale.productId)
    sale.unitCostAmount = lookup?.unitCostAmount ?? productById(sale.productId)?.purchaseCostAmount ?? 0
  }

  // Apply completion rules: zero the aircraft stock for meals, write a
  // discard stock_movement per product that gets cleared. For snacks /
  // beverages / duty-free, drop the aircraft stock for any batch that
  // is expired or damaged (snacks only — beverages/duty-free are
  // expired only via the simulation clock writing them off).
  const now = MOCK_NOW_ISO
  for (const line of newLines) {
    const category = ctx.categories.get(line.productId) ?? 'meal'
    const rows = snapshotAircraftStock(input.aircraftId).filter((r) => r.productId === line.productId)
    const totalOnAircraft = rows.reduce((acc, r) => acc + r.quantity, 0)
    if (totalOnAircraft === 0) continue
    let discardQty = 0
    if (category === 'meal') {
      discardQty = totalOnAircraft
    } else if (category === 'snack') {
      for (const r of rows) {
        const batch = snapshotStockBatches({}).find((b) => b.id === r.stockBatchId)
        if (batch && (batch.isDamaged || (batch.expiresAt != null && batch.expiresAt <= now))) {
          discardQty += r.quantity
        }
      }
    } else {
      // beverage / duty_free: discard only damaged rows.
      for (const r of rows) {
        const batch = snapshotStockBatches({}).find((b) => b.id === r.stockBatchId)
        if (batch && batch.isDamaged) {
          discardQty += r.quantity
        }
      }
    }
    if (discardQty > 0) {
      discardAircraftStock(input.aircraftId, line.productId, discardQty)
    }
  }

  // Mark the catering order closed (idempotent).
  const existingOrder = snapshotCateringOrders().find((o) => o.flightId === input.flightId)
  if (existingOrder && existingOrder.status !== 'closed') {
    try {
      closeCateringOrder(input.flightId)
    } catch {
      /* idempotent: ignore */
    }
  }

  const report: FlightReport = {
    id: nextId('fr'),
    flightId: input.flightId,
    flightNumber: flight.flightNumber,
    route: `${flight.departureAirport} → ${flight.arrivalAirport}`,
    status: 'submitted',
    submittedAt: MOCK_NOW_ISO,
    lines: newLines,
  }
  store.reports.set(input.flightId, report)
  return { ...report, lines: newLines.map(cloneLine) }
}

export function createFlightSale(flightId: string, productId: string, quantity: number, unitPriceAmount: number): ProductSale {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new FlightReportApiError('REPORT_INVALID', 'Sale quantity must be a positive integer.')
  }
  if (!Number.isFinite(unitPriceAmount) || unitPriceAmount < 0) {
    throw new FlightReportApiError('REPORT_INVALID', 'Unit price must be 0 or more.')
  }
  const product = productById(productId)
  if (!product) throw new FlightReportApiError('PRODUCT_NOT_OFFERED', 'Unknown product.')
  const sale: ProductSale = {
    id: nextId('ps'),
    flightId,
    productId,
    productName: product.name,
    quantity,
    unitPriceAmount,
    unitCostAmount: null,
    totalAmount: quantity * unitPriceAmount,
    currency: 'USD',
    paymentId: 'f5-confirmed',
    soldAt: MOCK_NOW_ISO,
  }
  store.sales.push(sale)
  return { ...sale }
}

// Patch an existing sale row (e.g. fix a mistype). Only the editable
// fields are accepted; the product, flight and payment id are fixed.
export function updateFlightSale(saleId: string, patch: { quantity?: number; unitPriceAmount?: number }): ProductSale {
  const sale = store.sales.find((s) => s.id === saleId)
  if (!sale) throw new FlightReportApiError('NOT_FOUND', 'Sale not found.')
  if (patch.quantity != null) {
    if (!Number.isInteger(patch.quantity) || patch.quantity <= 0) {
      throw new FlightReportApiError('REPORT_INVALID', 'Sale quantity must be a positive integer.')
    }
    sale.quantity = patch.quantity
  }
  if (patch.unitPriceAmount != null) {
    if (!Number.isFinite(patch.unitPriceAmount) || patch.unitPriceAmount < 0) {
      throw new FlightReportApiError('REPORT_INVALID', 'Unit price must be 0 or more.')
    }
    sale.unitPriceAmount = patch.unitPriceAmount
  }
  sale.totalAmount = sale.quantity * sale.unitPriceAmount
  // If the report has already been submitted, re-fill the unit cost from
  // the current earliest-expiring aircraft batch so the margin stays
  // consistent with the latest stock state.
  if (store.reports.has(sale.flightId)) {
    const flight = snapshotFlight(sale.flightId)
    if (flight) {
      const lookup = earliestAircraftBatch(flight.aircraftId, sale.productId)
      sale.unitCostAmount = lookup?.unitCostAmount ?? productById(sale.productId)?.purchaseCostAmount ?? 0
    }
  }
  return { ...sale }
}

export function deleteFlightSale(saleId: string): void {
  const idx = store.sales.findIndex((s) => s.id === saleId)
  if (idx === -1) throw new FlightReportApiError('NOT_FOUND', 'Sale not found.')
  store.sales.splice(idx, 1)
}
