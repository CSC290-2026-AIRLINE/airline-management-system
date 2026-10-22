export const FLIGHT_STATUSES = ['scheduled', 'delayed', 'holding', 'diverted', 'cancelled', 'departed', 'arrived'] as const

export type FlightStatus = (typeof FLIGHT_STATUSES)[number]

// Raw query-string values; validated by FlightSchedulingService.listFlights.
export interface ListFlightsQueryDto {
  status?: string
  route_id?: string
  service_date?: string // YYYY-MM-DD, origin-local
  cursor?: string // id of the last flight on the previous page
  limit?: string
}
