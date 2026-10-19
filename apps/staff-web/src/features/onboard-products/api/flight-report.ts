// Flight report + on-board sales + reportable-flights API. The
// "reportable flights" shape is a thin wrapper around the reportable
// list from the backend; the page uses aircraftId from the flight
// record.

import { useMemo } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ApiClient, ApiError, type ApiFetch } from './client'
import { FlightReportApiError } from './errors'
import { mapAircraftStockRow, mapFlightReport, mapProductSale, toCreateSaleInput } from './mappers'
import type { CreateFlightSaleInput, FlightReport, ProductSale, UpdateFlightSaleInput } from './types'

export type ReportableFlight = {
  id: string
  flightNumber: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  aircraftId: string
  reportSubmitted: boolean
}

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
        const wire = await client.get<unknown>(`/api/staff/flight-reports/flight/${flightId}`)
        return wire ? mapFlightReport(wire as never) : null
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        rethrow(err, new FlightReportApiError('NOT_FOUND', 'Flight report not found.', 0))
      }
    },
    async submitFlightReportApi(input) {
      try {
        const wire = await client.put<unknown>(`/api/staff/flight-reports/flight/${input.flightId}/submit`, {
          lines: input.lines.map((l) => ({ productId: l.productId, served: l.served, wasted: l.wasted, damaged: l.damaged })),
        })
        return mapFlightReport(wire as never)
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not submit the report.', 0))
      }
    },
    async listFlightSales(flightId) {
      try {
        const wire = await client.get<unknown[]>(`/api/staff/sales/flight/${flightId}`)
        return (wire ?? []).map((s) => mapProductSale(s as never))
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load sales.', 0))
      }
    },
    async createFlightSaleApi(input) {
      try {
        const wire = await client.put<unknown>(`/api/staff/sales/flight/${input.flightId}`, toCreateSaleInput(input))
        return mapProductSale(wire as never)
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not record the sale.', 0))
      }
    },
    async updateFlightSaleApi(saleId, patch) {
      try {
        const wire = await client.put<unknown>(`/api/staff/sales/${saleId}`, patch)
        return mapProductSale(wire as never)
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not update the sale.', 0))
      }
    },
    async deleteFlightSaleApi(saleId) {
      try {
        await client.delete(`/api/staff/sales/${saleId}`)
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not remove the sale.', 0))
      }
    },
    async listReportableFlights() {
      try {
        const wire = await client.get<unknown[]>('/api/staff/flight-reports/reportable-flights')
        return (wire ?? []).map((row) => {
          const r = row as Record<string, unknown>
          return {
            id: String(r.id),
            flightNumber: String(r.flight_number),
            departureAirport: String(r.departure_airport),
            arrivalAirport: String(r.arrival_airport),
            scheduledDeparture: String(r.scheduled_departure),
            aircraftId: String(r.aircraft_id),
            reportSubmitted: Boolean(r.report_submitted),
          }
        })
      } catch (err) {
        rethrow(err, new FlightReportApiError('UNKNOWN', 'Could not load reportable flights.', 0))
      }
    },
    async getAircraftStock(aircraftId) {
      try {
        const wire = await client.get<unknown[]>(`/api/staff/aircraft-stock/${aircraftId}`)
        return (wire ?? []).map((r) => mapAircraftStockRow(r as never))
      } catch (err) {
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
