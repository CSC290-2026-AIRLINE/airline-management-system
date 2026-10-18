// API for catering orders. Mirrors /staff/catering-orders and the
// /staff/flights/:flightId/{catering-order,stock-transfer} endpoints.
// Mock clock (mocks/clock.ts) is the only allowed time source.

import { delay } from '../mocks/delay'
import {
  CateringApiError,
  closeCateringOrder,
  markCateringOrderLoaded,
  refreshCateringOrder,
  snapshotCateringOrders,
  snapshotFlights,
  snapshotFlight,
} from '../mocks/orders'
import {
  getAvailableStock,
  snapshotAircraftStock,
  snapshotStockBatches,
  StockApiError,
  transferToAircraft,
  writeOffExpiredBatches,
} from '../mocks/stock'
import { mockWarehouses } from '../mocks/stock'
import type { AircraftStockRow, CateringOrder, CateringOrderLine, Flight, StockTransfer } from './types'

export class CateringApiError2 extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'CateringApiError'
  }
}

// The list endpoint returns every flight in range merged with its
// catering order (or `null` when ordering is still open). The UI's
// derived status comes from the catering order; the flight record is
// authoritative for the chip before cutoff.
export async function listCateringOrders(): Promise<Flight[]> {
  await delay()
  // Refresh all catering orders' shortfalls against current warehouse
  // stock so the "in warehouse" column on the right card matches the
  // Stock page and the banner updates without a manual refresh click.
  const orders = snapshotCateringOrders()
  const flights = snapshotFlights()
  // Apply shortfall recounts in-place through the api so the next
  // getCateringOrder sees the up-to-date numbers.
  for (const order of orders) {
    for (const line of order.lines) {
      const available = getAvailableStock(order.warehouseId, line.productId)
      line.quantityShort = Math.max(0, line.quantityRequired - available)
    }
  }
  return flights
}

export async function getCateringOrder(flightId: string): Promise<CateringOrder | null> {
  await delay()
  const flight = snapshotFlight(flightId)
  if (!flight) return null
  const order = snapshotCateringOrders().find((o) => o.flightId === flightId)
  if (!order) return null
  // Recount shortfalls against the freshest warehouse stock.
  for (const line of order.lines) {
    const available = getAvailableStock(order.warehouseId, line.productId)
    line.quantityShort = Math.max(0, line.quantityRequired - available)
  }
  return order
}

// Spec error code: ORDER_NOT_YET_DUE before cutoff. Idempotent after
// the order is generated.
export async function refreshCateringOrderApi(flightId: string): Promise<CateringOrder> {
  await delay()
  try {
    return refreshCateringOrder(flightId)
  } catch (err) {
    if (err instanceof CateringApiError) {
      throw new CateringApiError2(err.code, err.message)
    }
    throw err
  }
}

export async function createStockTransfer(flightId: string): Promise<StockTransfer> {
  await delay()
  // Write off any expired batches first so the transfer sees fresh stock
  // and the Stock page movements list reflects the cleanup.
  writeOffExpiredBatches()
  const order = snapshotCateringOrders().find((o) => o.flightId === flightId)
  if (!order) throw new CateringApiError2('NOT_FOUND', 'Catering order not found.')
  if (order.status === 'void') throw new CateringApiError2('CATERING_VOID', 'This flight is cancelled.')
  if (order.status === 'closed') throw new CateringApiError2('CATERING_CLOSED', 'This catering order is already closed.')
  if (order.status === 'loaded') {
    // Idempotent: the transfer is already in stock_transfers; surface it.
    const { snapshotStockTransfers } = await import('../mocks/stock')
    const existing = snapshotStockTransfers({ flightId })
    if (existing.length > 0) return existing[0]
  }
  // Each line's quantity to take is required minus existing short, so a
  // partially-shorted flight only transfers what it can cover.
  const flight = snapshotFlight(flightId)
  if (!flight) throw new CateringApiError2('NOT_FOUND', 'Flight not found.')
  const warehouse = mockWarehouses.find((w) => w.id === order.warehouseId)
  if (!warehouse) throw new CateringApiError2('NO_WAREHOUSE_FOR_AIRPORT', 'No warehouse for this flight.')

  const lines: Array<{ productId: string; quantity: number }> = []
  for (const line of order.lines) {
    const available = Math.max(0, getAvailableStock(order.warehouseId, line.productId))
    const need = Math.max(0, line.quantityRequired - line.quantityShort)
    const take = Math.min(available, need)
    if (take > 0) lines.push({ productId: line.productId, quantity: take })
  }
  if (lines.length === 0) {
    throw new CateringApiError2('STOCK_SHORTFALL', 'Nothing to transfer: every line is short.')
  }

  // Quick check that every batch is unexpired/undamaged so the user gets
  // a clear error before the per-line loop.
  const now = '2026-10-08T09:00:00Z'
  for (const line of lines) {
    const candidates = snapshotStockBatches({ warehouseId: order.warehouseId, productId: line.productId })
      .filter((b) => b.quantityRemaining > 0)
      .filter((b) => !b.isDamaged)
      .filter((b) => b.expiresAt == null || b.expiresAt > now)
    if (candidates.length === 0) {
      throw new CateringApiError2('BATCH_EXPIRED', `No valid batch available for product ${line.productId} in ${warehouse.code}.`)
    }
  }

  try {
    return transferToAircraft({
      flightId,
      aircraftId: flight.aircraftId,
      warehouseId: order.warehouseId,
      lines,
    })
  } catch (err) {
    if (err instanceof StockApiError) {
      throw new CateringApiError2(err.code, err.message)
    }
    throw err
  }
}

export async function markCateringOrderLoadedApi(flightId: string): Promise<CateringOrder> {
  await delay()
  try {
    return markCateringOrderLoaded(flightId)
  } catch (err) {
    if (err instanceof CateringApiError) {
      throw new CateringApiError2(err.code, err.message)
    }
    throw err
  }
}

export async function closeCateringOrderApi(flightId: string): Promise<CateringOrder> {
  await delay()
  try {
    return closeCateringOrder(flightId)
  } catch (err) {
    if (err instanceof CateringApiError) {
      throw new CateringApiError2(err.code, err.message)
    }
    throw err
  }
}

export async function getAircraftStock(aircraftId: string): Promise<AircraftStockRow[]> {
  await delay()
  return snapshotAircraftStock(aircraftId)
}

// Convenience: recompute the in-warehouse column for the UI without
// going through the catering-order store.
export function inWarehouse(warehouseId: string, productId: string): number {
  return getAvailableStock(warehouseId, productId)
}

// Re-export the line type so the page can use it without pulling the
// whole types module into the page bundle.
export type { CateringOrderLine, Flight, CateringOrder, AircraftStockRow, StockTransfer }
