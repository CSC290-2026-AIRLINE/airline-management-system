export const BI_RUN_TRIGGERS = ['scheduled', 'manual'] as const
export type BiRunTrigger = (typeof BI_RUN_TRIGGERS)[number]

export interface BiRunSummary {
  id: string
  trigger: BiRunTrigger
  status: 'running' | 'success' | 'failed'
  /** UTC, ISO 8601 with a `Z` suffix. Read as text so the driver's timezone cannot shift it. */
  data_as_of: string
  started_at: string
  finished_at: string | null
  row_count: number | null
  error_message: string | null
}

/** Sums for one day (or a range of days). Rates are computed from these sums, never averaged. */
export interface BiMetricSums {
  flight_count: number
  cancelled_count: number
  departed_count: number
  on_time_count: number
  delay_minutes: number
  seat_available: number
  seat_sold: number
  revenue_amount: number
  refund_amount: number
}

export interface BiDailyMetric extends BiMetricSums {
  /** `YYYY-MM-DD`, the flight's local service date. */
  flight_date: string
}

export interface BiRouteMetric extends BiMetricSums {
  route_id: string
  origin: string
  destination: string
}

export interface BiDelayCause {
  category: string
  events: number
  delay_minutes: number
}

export interface BiBookingDay {
  /** `YYYY-MM-DD`, the local date at the route's origin. */
  booking_date: string
  booking_count: number
  cancellation_count: number
}

export interface BiKpis extends BiMetricSums {
  on_time_pct: number | null
  load_factor: number | null
  revenue_per_seat: number | null
}
