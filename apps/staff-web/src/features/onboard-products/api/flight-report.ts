// API for the flight report. Mirrors /staff/flights/:flightId/flight-report.

import { delay } from '../mocks/delay'
import { mockFlightReport } from '../mocks/flight-report'
import type { FlightReport } from './types'

export async function getFlightReport(flightId: string): Promise<FlightReport | null> {
  await delay()
  return mockFlightReport.flightId === flightId ? mockFlightReport : null
}
