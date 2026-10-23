// Shapes returned by the /api/flight-scheduling endpoints.
export const FLIGHT_STATUSES = ['scheduled', 'delayed', 'holding', 'diverted', 'cancelled', 'departed', 'arrived'] as const

export interface FlightRow {
  id: string
  flight_number: string
  service_date: string
  route_id: string
  scheduled_dep_at: string
  dep_at: string
  arr_at: string
  actual_destination: string | null
  status: string
  aircraft: { tail_number: string }
}

export interface RouteRow {
  id: string
  origin: string
  destination: string
  distance_km: number
  block_time_min: number
  is_active: boolean
  pattern_count?: number // timetables that use the route; the list endpoint counts them
}

export interface AirportRow {
  iata_code: string
  icao_code: string
  name: string
  city: string
  country: string
  timezone: string
  min_turnaround_min: number
  is_active: boolean
}

export interface TimetableRow {
  id: string
  route_id: string
  flight_number: string
  dep_time_local: string // HH:MM, origin time
  days_of_week: number[]
  valid_from: string
  valid_to: string
  generated_flights?: number // flights generated from this pattern; the list endpoint counts them
}

export interface AirportBrief {
  iata_code: string
  name: string
  city: string
  country: string
  timezone: string
}

// GET /flights/:id
export interface FlightDetail extends Omit<FlightRow, 'route_id'> {
  pattern_id: string | null
  created_at: string
  effective_destination: string
  delay_minutes: number
  route: { id: string; distance_km: number; block_time_min: number; origin: AirportBrief | null; destination: AirportBrief | null }
}

export interface AirportFeeRow {
  id: string
  airport: string
  fee_type: string
  applies_on: string
  amount: number
  unit: string
  currency: string
  effective_from: string
  effective_to: string | null
}

export interface CongestionRow {
  id: string
  airport: string
  starts_at: string
  ends_at: string
  max_movement_per_hour: number
  disruption_reason_code: string
  peak_movements: number
  over_limit: { flight_id: string; flight_number: string; service_date: string; kind: 'departs' | 'arrives'; at: string }[]
}
