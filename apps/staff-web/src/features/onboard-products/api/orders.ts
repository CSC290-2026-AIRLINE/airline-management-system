// Catering orders + catering-flight API. Wraps the catering-orders
// endpoints and the flight-scoped stock transfer and aircraft stock
// endpoints. The catering order of a flight lives under
// /staff/flights/:flightId, and the stock transfer that loads it is its
// own POST.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { CateringApiError } from './errors'
import { mapAircraftStockRow, mapCateringOrder, mapFlight, mapStockTransfer } from './mappers'
import { MissingIdError, requireId } from './guards'
import type { AircraftStockRow, CateringOrder, Flight, StockTransfer } from './types'

// The filters the catering-orders list endpoint accepts.
export interface CateringOrderFilters {
  from?: string
  to?: string
}

export interface OrdersApi {
  listCateringOrders: (filters?: CateringOrderFilters) => Promise<Flight[]>
  getCateringOrder: (flightId: string) => Promise<CateringOrder | null>
  refreshCateringOrderApi: (flightId: string) => Promise<CateringOrder>
  markCateringOrderLoadedApi: (flightId: string) => Promise<CateringOrder>
  closeCateringOrderApi: (flightId: string) => Promise<CateringOrder>
  createStockTransfer: (flightId: string) => Promise<StockTransfer>
  getAircraftStock: (aircraftId: string) => Promise<AircraftStockRow[]>
}

function rethrow(err: unknown, fallback: CateringApiError): never {
  if (err instanceof CateringApiError) throw err
  if (err instanceof ApiError) throw new CateringApiError(err.code, err.message, err.status, err.details)
  throw fallback
}

export function createOrdersApi(client: ApiClient): OrdersApi {
  return {
    async listCateringOrders(filters) {
      try {
        const wire = await client.get<unknown[]>('/api/staff/catering-orders', { from: filters?.from, to: filters?.to })
        return (wire ?? []).map((f) => mapFlight(f as never))
      } catch (err) {
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not load flights.', 0))
      }
    },
    async getCateringOrder(flightId) {
      try {
        requireId('GET /api/staff/flights/:flightId/catering-order', 'flightId', flightId)
        const wire = await client.get<unknown>(`/api/staff/flights/${flightId}/catering-order`)
        return wire ? mapCateringOrder(wire as never) : null
      } catch (err) {
        if (err instanceof MissingIdError) return null
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
      }
    },
    async refreshCateringOrderApi(flightId) {
      try {
        requireId('POST /api/staff/flights/:flightId/catering-order', 'flightId', flightId)
        const wire = await client.post<unknown>(`/api/staff/flights/${flightId}/catering-order`, {})
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
        requireId('PUT /api/staff/flights/:flightId/catering-order/loaded', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/flights/${flightId}/catering-order/loaded`, {})
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
        // The staff API has no separate close route: the order is closed
        // out by the flight report, and the last staff-side action on it
        // is the same "loaded" write the transfer ends with.
        requireId('PUT /api/staff/flights/:flightId/catering-order/loaded (close)', 'flightId', flightId)
        const wire = await client.put<unknown>(`/api/staff/flights/${flightId}/catering-order/loaded`, {})
        return mapCateringOrder(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Catering order not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not close the order.', 0))
      }
    },
    async createStockTransfer(flightId) {
      try {
        // The transfer moves the ordered lines from the warehouse to the
        // aircraft, earliest expiry first. The order is marked loaded
        // afterwards, with a separate call.
        requireId('POST /api/staff/flights/:flightId/stock-transfers', 'flightId', flightId)
        const wire = await client.post<unknown>(`/api/staff/flights/${flightId}/stock-transfers`, {})
        return mapStockTransfer(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new CateringApiError('NOT_FOUND', 'Flight not found.', 0))
        }
        rethrow(err, new CateringApiError('UNKNOWN', 'Could not transfer the stock.', 0))
      }
    },
    async getAircraftStock(aircraftId) {
      try {
        requireId('GET /api/staff/aircraft/:aircraftId/stock', 'aircraftId', aircraftId)
        const wire = await client.get<unknown[]>(`/api/staff/aircraft/${aircraftId}/stock`)
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
