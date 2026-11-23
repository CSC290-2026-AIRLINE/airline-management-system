// Flight report + on-board sales API. The reportable flights come from
// the catering-orders list: a flight can be reported on once its
// catering order is loaded (or already closed out). The page uses
// aircraftId from the flight record.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { FlightReportApiError } from './errors'
import { mapFlightReport, mapProductSale, mapReportableFlight, toCreateSaleInput, type ReportableFlight } from './mappers'
import { MissingIdError, requireId } from './guards'
import type { CreateFlightSaleInput, FlightReport, ProductSale, UpdateFlightSaleInput } from './types'

export type { ReportableFlight } from './mappers'

export interface FlightReportApi {
  getFlightReport: (flightId: string) => Promise<FlightReport | null>
  submitFlightReportApi: (input: {
    flightId: string
    lines: Array<{ productId: string; served: number; wasted: number; damaged: number }>
  }) => Promise<FlightReport>
  listFlightSales: (flightId: string) => Promise<ProductSale[]>
  createFlightSaleApi: (input: CreateFlightSaleInput) => Promise<ProductSale>
  updateFlightSaleApi: (flightId: string, saleId: string, patch: UpdateFlightSaleInput) => Promise<ProductSale>
  deleteFlightSaleApi: (flightId: string, saleId: string) => Promise<void>
  listReportableFlights: () => Promise<ReportableFlight[]>
  listLoadedProducts: (flightId: string) => Promise<Array<{ productId: string; quantity: number }>>
  // The resolved meal policy of each cabin on the flight (GET /api/staff/flights/:flightId/cabin-settings).
  getFlightMealPolicy: (flightId: string) => Promise<FlightMealPolicy[]>
}

export interface FlightMealPolicy {
  cabin: string
  mealService: 'complimentary' | 'paid' | 'none'
  includedPerPassenger: number
}

function rethrow(err: unknown, fallback: FlightReportApiError): never {
  if (err instanceof FlightReportApiError) throw err
  if (err instanceof ApiError) throw new FlightReportApiError(err.code, err.message, err.status, err.details)
  throw fallback
}

export function createFlightReportApi(client: ApiClient): FlightReportApi {
  return {
    async getFlightReport(flightId) {
      try {
        requireId('GET /api/staff/flights/:flightId/flight-report', 'flightId', flightId)
        const wire = await client.get<unknown>(`/api/staff/flights/${flightId}/flight-report`)
        return wire ? mapFlightReport(wire as never) : null
      } catch (err) {
        if (err instanceof MissingIdError) return null
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight report not found.', 0))
      }
    },
    async submitFlightReportApi(input) {
      try {
        requireId('PUT /api/staff/flights/:flightId/flight-report', 'flightId', input.flightId)
        const wire = await client.put<unknown>(`/api/staff/flights/${input.flightId}/flight-report`, {
          lines: input.lines.map((l) => ({ productId: l.productId, served: l.served, wasted: l.wasted, damaged: l.damaged })),
        })
        return mapFlightReport(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight report not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not submit the report.', 0))
      }
    },
    async listFlightSales(flightId) {
      try {
        requireId('GET /api/staff/flights/:flightId/sales', 'flightId', flightId)
        const wire = await client.get<unknown[]>(`/api/staff/flights/${flightId}/sales`)
        return (wire ?? []).map((s) => mapProductSale(s as never))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load sales.', 0))
      }
    },
    async createFlightSaleApi(input) {
      try {
        requireId('POST /api/staff/flights/:flightId/sales', 'flightId', input.flightId)
        const wire = await client.post<unknown>(`/api/staff/flights/${input.flightId}/sales`, toCreateSaleInput(input))
        return mapProductSale(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not record the sale.', 0))
      }
    },
    async updateFlightSaleApi(flightId, saleId, patch) {
      try {
        requireId('PUT /api/staff/flights/:flightId/sales/:saleId', 'flightId', flightId)
        requireId('PUT /api/staff/flights/:flightId/sales/:saleId', 'saleId', saleId)
        const wire = await client.put<unknown>(`/api/staff/flights/${flightId}/sales/${saleId}`, patch)
        return mapProductSale(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Sale not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not update the sale.', 0))
      }
    },
    async deleteFlightSaleApi(flightId, saleId) {
      try {
        requireId('DELETE /api/staff/flights/:flightId/sales/:saleId', 'flightId', flightId)
        requireId('DELETE /api/staff/flights/:flightId/sales/:saleId', 'saleId', saleId)
        await client.delete(`/api/staff/flights/${flightId}/sales/${saleId}`)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Sale not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not remove the sale.', 0))
      }
    },
    async listReportableFlights() {
      try {
        // The catering-orders list is the flight list with the order
        // status. A flight can be reported on once its order is loaded
        // or already closed out.
        const wire = await client.get<unknown[]>('/api/staff/catering-orders')
        return (wire ?? [])
          .filter((row) => {
            const status = (row as { status?: string }).status
            return status === 'loaded' || status === 'closed'
          })
          .map((r) => mapReportableFlight(r as never))
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load reportable flights.', 0))
      }
    },
    async getFlightMealPolicy(flightId) {
      try {
        requireId('GET /api/staff/flights/:flightId/cabin-settings', 'flightId', flightId)
        const wire = await client.get<Record<string, { mealService: FlightMealPolicy['mealService']; includedPerPassenger: number }>>(
          `/api/staff/flights/${flightId}/cabin-settings`,
        )
        return Object.entries(wire ?? {}).map(([cabin, s]) => ({
          cabin,
          mealService: s.mealService,
          includedPerPassenger: Number(s.includedPerPassenger ?? 0),
        }))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load the meal policy.', 0))
      }
    },
    async listLoadedProducts(flightId) {
      const endpoint = `/api/staff/flights/${flightId}/flight-report/loaded-products`
      try {
        requireId(endpoint, 'flightId', flightId)
        return await client.get<Array<{ productId: string; quantity: number }>>(endpoint)
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load the products transferred for this flight.', 0))
      }
    },
  }
}

export { FlightReportApiError }

export function useFlightReportApi(): FlightReportApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createFlightReportApi(new ApiClient(fetchWithAuth as ApiFetch)), [fetchWithAuth])
}
