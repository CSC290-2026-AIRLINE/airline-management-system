import type { BiFlightRow } from './bi-query.service'
import type { RevenueMode } from './dto/bi-options'

export interface FlightDto {
  flight_number: string
  flight_date: string
  route: string
  status: string
  delay_minutes: number | null
  cause: string | null
  seat_sold: number
  seat_available: number
  /** Null when a cabin is chosen: the reporting copy has revenue per flight only, not per cabin. */
  revenue: number | null
}

/**
 * One flight as the drill-down shows it. Revenue is per flight, so when a cabin filter is given the revenue is null rather
 * than the whole flight's figure next to one cabin's seats.
 */
export function toFlightDto(mode: RevenueMode, cabin?: string) {
  return (row: BiFlightRow): FlightDto => ({
    flight_number: row.flight_number,
    flight_date: row.flight_date,
    route: `${row.origin} – ${row.destination}`,
    status: row.status,
    delay_minutes: row.delay_minutes,
    cause: row.cause,
    seat_sold: row.seat_sold,
    seat_available: row.seat_available,
    revenue: cabin ? null : Number((mode === 'after_refunds' ? row.revenue_amount - row.refund_amount : row.revenue_amount).toFixed(2)),
  })
}
