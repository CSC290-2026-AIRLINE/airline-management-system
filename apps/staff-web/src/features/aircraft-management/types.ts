/**
 * The shapes below mirror the API responses of the aircraft management module. They keep the
 * snake_case field names of the wire format so nothing has to be renamed on the way in.
 */

export const AIRCRAFT_STATUSES = ['in_service', 'in_maintenance', 'grounded'] as const
export type AircraftStatus = (typeof AIRCRAFT_STATUSES)[number]

/** Only these two can be set by hand; `in_maintenance` comes from a maintenance window. */
export const MANUAL_AIRCRAFT_STATUSES = ['in_service', 'grounded'] as const
export type ManualAircraftStatus = (typeof MANUAL_AIRCRAFT_STATUSES)[number]

export const MAINTENANCE_TYPES = ['a_check', 'b_check', 'c_check', 'd_check', 'unscheduled'] as const
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number]

export const CABIN_CLASSES = ['first', 'business', 'premium_economy', 'economy'] as const
export type CabinClass = (typeof CABIN_CLASSES)[number]

export const TURNAROUND_TASK_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'] as const
export type TurnaroundTaskStatus = (typeof TURNAROUND_TASK_STATUSES)[number]

export interface AircraftStatusSummary {
  status: AircraftStatus
  origin: string | null
  reason: string | null
  start_date: string | null
  end_date: string | null
}

export interface AircraftTypeRef {
  id: string
  code: string
  model: string
}

/** One row of the fleet list: the status is one word, as the requirement document gives it. */
export interface Aircraft {
  id: string
  tail_number: string
  aircraft_type_id: string
  entry_into_service_date: string
  retired_on: string | null
  base_airport_code: string
  current_status: AircraftStatus
  aircraft_type?: AircraftTypeRef
}

/** The aircraft as the detail, create and edit routes answer it, with the whole current status period. */
export interface AircraftDetail extends Omit<Aircraft, 'current_status' | 'aircraft_type'> {
  current_status: AircraftStatusSummary
}

export interface CabinLayout {
  cabin_class: CabinClass
  first_row: number
  last_row: number
  columns: string[]
  aisle_after?: string[]
  skip_rows?: number[]
  row_types?: Record<string, number[]>
  blocked_seats?: string[]
}

export interface AircraftTypeLayout {
  cabins: CabinLayout[]
}

export interface AircraftType {
  id: string
  code: string
  manufacturer: string
  model: string
  layout: AircraftTypeLayout
  total_seats: number
  hold_weight_limit_kg: number
  max_takeoff_weight_kg: number
  max_range_km: number
  min_turnaround_minutes: number
  operating_cost_per_hour: number
  cost_currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StatusPeriod {
  id: string
  aircraft_id: string
  status: AircraftStatus
  origin: string | null
  reason: string | null
  start_date: string
  end_date: string | null
}

export interface MaintenanceWindow {
  id: string
  aircraft_id: string
  maintenance_type: string
  planned_start_date: string
  planned_end_date: string
  actual_end_date: string | null
  /** `in_progress` is derived by the backend from the planned start date on the simulation clock. */
  status: string
  status_period_id: string | null
}

export interface TurnaroundTask {
  id: string
  task_type: string
  status: TurnaroundTaskStatus
  started_at: string | null
  completed_at: string | null
}

export interface Turnaround {
  id: string
  aircraft_id: string
  flight_id: string
  airport_code: string
  arrived_at: string
  is_ready: boolean
  ready_at: string | null
  tasks: TurnaroundTask[]
}

export interface FleetReserve {
  date: string
  aircraft_needed: number
  reserve_ratio: number
  target: number
  ready: number
  shortfall: number
}

/** Monday is 1, matching the `day_of_week` column of `aircraft_operating_day`. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export type Weekday = (typeof WEEKDAYS)[number]
