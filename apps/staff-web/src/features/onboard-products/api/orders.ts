// Catering orders + catering-flight API. Wraps the catering-orders
// controller and the stock-transfers + aircraft-stock controllers (both
// read-only from the staff-web's perspective; mutations happen via
// catering-orders PUT /load).

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { CateringApiError } from './errors'
import { mapAircraftStockRow, mapCateringOrder, mapFlight, mapStockTransfer } from './mappers'
import { MissingIdError, requireId } from './guards'
import type { AircraftStockRow, CateringOrder, Flight, StockTransfer } from './types'

export interface OrdersApi {
  listCateringOrders: () => Promise<Flight[]>
  getCateringOrder: (flightId: string) => Promise<CateringOrder | null>
  refreshCateringOrderApi: (flightId: string) => Promise<CateringOrder>
  markCateringOrderLoadedApi: (flightId: string) => Promise<CateringOrder>
  closeCateringOrderApi: (flightId: string) => Promise<CateringOrder>
  voidCateringOrderApi: (flightId: string) => Promise<CateringOrder>
  createStockTransfer: (flightId: string) => Promise<StockTransfer>
  getStockTransfers: (flightId: string) => Promise<StockTransfer[]>
  getAircraftStock: (aircraftId: string) => Promise<AircraftStockRow[]>
}

function rethrow(err: unknown, fallback: CateringApiError): never {
  if (err instanceof CateringApiError) throw err
  if (err instanceof ApiError) throw new CateringApiError(err.code, err.message, err.status, err.details)
  throw fallback
}

export function createOrdersApi(client: ApiClient): OrdersApi {
  return {
    async listCateringOrders() {
      try {
        const wire = await client.get<unknown[]>('/api/staff/catering-orders')
        return (wire ?? []).map((f) => mapFlight(f as never))
      } catch (err) {
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not load flights.', 0))
      }
    },
    async getCateringOrder(flightId) {
      try {
        requireId('GET /api/staff/catering-orders/flight/:id', 'flightId', flightId)
        const wire = await client.get<unknown>(`/api/staff/catering-orders/flight/${flightId}`)
        return wire ? mapCateringOrder(wire as never) : null
      } catch (err) {
        if (err instanceof MissingIdError) return null
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
      }
    },
    async refreshCateringOrderApi(flightId) {
      try {
        requireId('PUT /api/staff/catering-orders/flight/:id/refresh', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/refresh`, {})
        return mapCateringOrder(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not refresh the order.', 0))
      }
    },
    async markCateringOrderLoadedApi(flightId) {
      try {
        requireId('PUT /api/staff/catering-orders/flight/:id/load', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/load`, {})
        return mapCateringOrder(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not load the order.', 0))
      }
    },
    async closeCateringOrderApi(flightId) {
      try {
        requireId('PUT /api/staff/catering-orders/flight/:id/close', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/close`, {})
        return mapCateringOrder(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not close the order.', 0))
      }
    },
    async voidCateringOrderApi(flightId) {
      try {
        requireId('PUT /api/staff/catering-orders/flight/:id/void', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/void`, {})
        return mapCateringOrder(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not void the order.', 0))
      }
    },
    async createStockTransfer(flightId) {
      try {
        // The F12 backend doesn't expose a free-standing /stock-transfers
        // create endpoint. The "transfer" happens inside the catering-order
        // The /load flow: refresh first (re-applies defaults), then load, then
        // close is not allowed while the order is still loading -- mirror that.
        // surface the transfer that was just produced.
        requireId('PUT /api/staff/stock-transfers (via catering-orders)', 'flightId', flightId)
        await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/refresh`, {})
        const wire = await client.put<unknown>(`/api/staff/catering-orders/flight/${flightId}/load`, {})
        const order = mapCateringOrder(wire as never)
        const transfers = await client.get<unknown[]>(`/api/staff/stock-transfers/flight/${flightId}`)
        const first = (transfers ?? []).map((t) => mapStockTransfer(t as never))[0]
        if (first) return first
        // Fall back: synthesize from the order. The page only uses this
        // for the success toast, so a stub with the flight id is enough.
        return {
          id: `transfer-${flightId}`,
          flightId,
          aircraftId: order.aircraftId,
          warehouseId: order.warehouseId,
          transferredAt: new Date().toISOString(),
          lines: order.lines.map((l) => ({ productId: l.productId, stockBatchId: '', quantity: 0 })),
        }
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Flight not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not transfer the stock.', 0))
      }
    },
    async getStockTransfers(flightId) {
      try {
        requireId('GET /api/staff/stock-transfers/flight/:id', 'flightId', flightId)
        const wire = await client.get<unknown[]>(`/api/staff/stock-transfers/flight/${flightId}`)
        return (wire ?? []).map((t) => mapStockTransfer(t as never))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not load stock transfers.', 0))
      }
    },
    async getAircraftStock(aircraftId) {
      try {
        requireId('GET /api/staff/aircraft-stock/:id', 'aircraftId', aircraftId)
        const wire = await client.get<unknown[]>(`/api/staff/aircraft-stock/${aircraftId}`)
        return (wire ?? []).map((r) => mapAircraftStockRow(r as never))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not load aircraft stock.', 0))
      }
    },
  }
}

export { CateringApiError }

export function useOrdersApi(): OrdersApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createOrdersApi(new ApiClient(fetchWithAuth as ApiFetch)), [fetchWithAuth])
}
