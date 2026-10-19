// Flight report + on-board sales + reportable-flights API. The
// "reportable flights" shape is a thin wrapper around the reportable
// list from the backend; the page uses aircraftId from the flight
// record.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { FlightReportApiError } from './errors'
import {
  mapAircraftStockRow,
  mapFlightReport,
  mapProductSale,
  mapReportableFlight,
  toCreateSaleInput,
  type ReportableFlight,
} from './mappers'
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
  updateFlightSaleApi: (saleId: string, patch: UpdateFlightSaleInput) => Promise<ProductSale>
  deleteFlightSaleApi: (saleId: string) => Promise<void>
  listReportableFlights: () => Promise<ReportableFlight[]>
  getAircraftStock: (aircraftId: string) => Promise<ReturnType<typeof mapAircraftStockRow>[]>
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
        requireId('GET /api/staff/flight-reports/flight/:id', 'flightId', flightId)
        const wire = await client.get<unknown>(`/api/staff/flight-reports/flight/${flightId}`)
        return wire ? mapFlightReport(wire as never) : null
      } catch (err) {
        if (err instanceof MissingIdError) return null
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight report not found.', 0))
      }
    },
    async submitFlightReportApi(input) {
      try {
        requireId('PUT /api/staff/flight-reports/flight/:id/submit', 'flightId', input.flightId)
        const wire = await client.put<unknown>(`/api/staff/flight-reports/flight/${input.flightId}/submit`, {
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
        requireId('GET /api/staff/sales/flight/:id', 'flightId', flightId)
        const wire = await client.get<unknown[]>(`/api/staff/sales/flight/${flightId}`)
        return (wire ?? []).map((s) => mapProductSale(s as never))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load sales.', 0))
      }
    },
    async createFlightSaleApi(input) {
      try {
        requireId('PUT /api/staff/sales/flight/:id', 'flightId', input.flightId)
        const wire = await client.put<unknown>(`/api/staff/sales/flight/${input.flightId}`, toCreateSaleInput(input))
        return mapProductSale(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not record the sale.', 0))
      }
    },
    async updateFlightSaleApi(saleId, patch) {
      try {
        requireId('PUT /api/staff/sales/:id', 'saleId', saleId)
        const wire = await client.put<unknown>(`/api/staff/sales/${saleId}`, patch)
        return mapProductSale(wire as never)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Sale not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not update the sale.', 0))
      }
    },
    async deleteFlightSaleApi(saleId) {
      try {
        requireId('DELETE /api/staff/sales/:id', 'saleId', saleId)
        await client.delete(`/api/staff/sales/${saleId}`)
      } catch (err) {
        if (err instanceof MissingIdError) {
          rethrow(err, new FlightReportApiError('NOT_FOUND', 'Sale not found.', 0))
        }
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not remove the sale.', 0))
      }
    },
    async listReportableFlights() {
      try {
        const wire = await client.get<unknown[]>('/api/staff/flight-reports/reportable-flights')
        return (wire ?? []).map((r) => mapReportableFlight(r as never))
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load reportable flights.', 0))
      }
    },
    async getAircraftStock(aircraftId) {
      try {
        requireId('GET /api/staff/aircraft-stock/:id', 'aircraftId', aircraftId)
        const wire = await client.get<unknown[]>(`/api/staff/aircraft-stock/${aircraftId}`)
        return (wire ?? []).map((r) => mapAircraftStockRow(r as never))
      } catch (err) {
        if (err instanceof MissingIdError) return []
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load aircraft stock.', 0))
      }
    },
  }
}

export { FlightReportApiError }

export function useFlightReportApi(): FlightReportApi {
  const { fetchWithAuth } = useAppAuth()
  return useMemo(() => createFlightReportApi(new ApiClient(fetchWithAuth as ApiFetch)), [fetchWithAuth])
}
