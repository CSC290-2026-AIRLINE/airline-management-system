// API for the flight report. Mirrors /staff/flights/:flightId/flight-report,
// /staff/flights/:flightId/flight-report/sales, and
// /staff/flights/:flightId/on-board-sales.

import { delay } from '../mocks/delay'
import {
  createFlightSale,
  deleteFlightSale,
  FlightReportApiError,
  listReportableFlightsFromCache,
  snapshotFlightReport,
  snapshotFlightSales,
  submitFlightReport,
  updateFlightSale,
} from '../mocks/flight-report'
import { snapshotFlight, snapshotFlights } from '../mocks/orders'
import type { CreateFlightSaleInput, Flight, FlightReport, ProductSale, SubmitFlightReportInput, UpdateFlightSaleInput } from './types'

export { FlightReportApiError }
import type { ReportableFlight } from '../mocks/flight-report'
export type { ReportableFlight }

export async function getFlightReport(flightId: string): Promise<FlightReport | null> {
  await delay()
  return snapshotFlightReport(flightId)
}

// The page-facing shape: only flight id + per-line numbers. The
// aircraftId is looked up by the api layer from the flight record.
export async function submitFlightReportApi(input: SubmitFlightReportInput): Promise<FlightReport> {
  await delay()
  const flight = snapshotFlight(input.flightId)
  if (!flight) throw new FlightReportApiError('NOT_FOUND', 'Flight not found.')
  try {
    return submitFlightReport(
      {
        flightId: input.flightId,
        aircraftId: flight.aircraftId,
        lines: input.lines,
      },
      flight,
    )
  } catch (err) {
    if (err instanceof FlightReportApiError) throw err
    throw err
  }
}

export async function listFlightSales(flightId: string): Promise<ProductSale[]> {
  await delay()
  return snapshotFlightSales(flightId)
}

export async function createFlightSaleApi(input: CreateFlightSaleInput): Promise<ProductSale> {
  await delay()
  return createFlightSale(input.flightId, input.productId, input.quantity, input.unitPriceAmount)
}

export async function updateFlightSaleApi(saleId: string, patch: UpdateFlightSaleInput): Promise<ProductSale> {
  await delay()
  return updateFlightSale(saleId, patch)
}

export async function deleteFlightSaleApi(saleId: string): Promise<void> {
  await delay()
  deleteFlightSale(saleId)
}

// -- Flight picker --------------------------------------------------------
// The list endpoint returns every flight whose catering order is
// loaded or closed (i.e. ready to be reported on), with a flag for
// whether a report has already been submitted.

export async function listReportableFlights(): Promise<ReportableFlight[]> {
  await delay()
  const flights: Flight[] = snapshotFlights()
  return listReportableFlightsFromCache(flights)
}
