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
  aircraft_id: string
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

// GET /conflicts (an array, newest first)
export interface ConflictRow {
  id: string
  flight_id: string
  kind: string // cascade, aircraft_position, ...
  detail: string
  status: string
  detected_at: string
  flight: { flight_number: string; status: string; dep_at: string; arr_at: string; route: { origin: string; destination: string } }
}

export type Resolution = 'change_aircraft' | 'reschedule' | 'cancel_refund' | 'rebook_partner'

// GET /conflicts/:id/options
export interface ConflictOptions {
  conflict: ConflictRow
  options: { resolution: Resolution; available: boolean; needs: string[]; notes: string[]; blocked_by?: string }[]
}

// GET /flights/:id/events, oldest first
export interface FlightEventRow {
  id: string
  seq: number
  type: string // delayed, diverted, cancelled, ...
  occurred_at: string
  disruption_reason_code: string | null
  delay_minutes: number | null
  note: string | null
}

// The fixed disruption categories from the spec; every disruption reason belongs to one.
export const DISRUPTION_CATEGORIES = ['weather', 'technical', 'crew', 'air traffic control', 'security', 'airport operations', 'other']

// Shapes for the parts that wait on another feature or a missing table (see connected.ts). ponytail: these are what the screens
// need, not an agreed contract; align them with the real responses when the endpoints exist.

// One aircraft from feature 9.
export interface AircraftOption {
  id: string // aircraft UUID, sent as aircraft_id
  label: string // "HS-AB1 · A320 · in service"
  usable: boolean
}

export interface GateResult {
  passed: boolean
  text: string
}

// One read-only check before a reschedule (aircraft, range, position and turnaround, congestion).
export interface RescheduleCheck {
  label: 'Passed' | 'Failed'
  text: string
}

export type Approval = 'none' | 'not_requested' | 'pending' | 'approved' | 'offered' | 'rejected'

export interface ApprovalAnswer {
  approval: Approval
  text: string
  slots: string[] // HH:MM departures offered, when approval is 'offered'
}

export type ApprovalStatus = 'pending' | 'approved' | 'alternative_offered' | 'rejected' | 'superseded' | 'consumed' | 'expired'

// One offered departure time: a slot has no end, a window runs to ends_at inclusive.
export interface ApprovalOffer {
  kind: 'slot' | 'window'
  starts_at: string
  ends_at: string | null
}

// One row from GET /approvals.
export interface ApprovalRow {
  id: string
  purpose: 'new_flight' | 'reschedule'
  flight_id: string | null
  route_id: string
  flight_number: string
  service_date: string
  aircraft_id: string
  proposed_dep_at: string
  proposed_arr_at: string
  approver_airport: string | null
  status: ApprovalStatus
  reject_reason: string | null
  response_note: string | null
  revision: number
  previous_approval_id: string | null
  covered_by_approval_id: string | null
  requested_at: string
  responded_at: string | null
  offers: ApprovalOffer[]
}

// GET /airports/:iata/approval-policy. Null times mean no curfew; a null cap means no limit.
export interface ApprovalPolicy {
  airport: string
  curfew_start_local: string | null
  curfew_end_local: string | null
  max_departure_per_hour: number | null
  offer_style: 'slots' | 'window'
}

// One row of the disruption log (events across all flights).
export interface DisruptionLogRow {
  at: string
  flight: string
  date: string
  event: string
  reason: string // "WX · weather" or ''
  category: string // '' when there is no disruption
  detail: string
  by: string
}

// GET /flights/:id/availability?dep_at=
export interface Availability {
  flight_id: string
  dep_at: string
  arr_at: string
  feasible: boolean
  outcome: 'feasible' | 'not_feasible' | 'incomplete'
  violations: { kind: string; detail: string }[]
  pending: string[]
}

// GET /flights/:id/cost-estimate. Revenue and per-hour fees are listed in `pending` until the features that own them are connected.
export interface CostEstimate {
  flight_id: string
  flight_number: string
  block_hours: number
  lines: { item: string; basis: string; amount: number; currency: string }[]
  total: { amount: number; currency: string } | null
  pending: string[]
}

// GET /flights/:id/impact
export interface FlightImpact {
  bookings: number
  crew: number
  bags: number
  cargo: number
}
