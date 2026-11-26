import { periodOf } from './bi-period'
import type { PeriodGroup } from './dto/bi-options'

/** A rate as a fraction of its base, or `null` when the base is zero (no division by zero on empty periods). */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Every `YYYY-MM-DD` from `from` to `to` inclusive. Empty when `to` is before `from`. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export interface AircraftWindow {
  in_service_from: string
  retired_on: string | null
}

export interface DowntimeWindow {
  start_date: string
  end_date: string
}

/**
 * Days in `[from, to]` that the aircraft could fly: it is in service that day and not grounded or in maintenance.
 * `Out of service` counts the days of its downtime periods that fall in the range.
 */
export function flyableDays(
  from: string,
  to: string,
  aircraft: AircraftWindow,
  downtime: DowntimeWindow[],
): { available: number; out_of_service: number } {
  const days = daysBetween(from, to)
  const inDowntime = (day: string) => downtime.some((d) => d.start_date <= day && day <= d.end_date)
  // retired_on is the aircraft's last day in the fleet (feature 9's rule), so that day still counts.
  const inService = (day: string) => aircraft.in_service_from <= day && (!aircraft.retired_on || day <= aircraft.retired_on)
  let available = 0
  let outOfService = 0
  for (const day of days) {
    if (!inService(day)) continue
    if (inDowntime(day)) outOfService += 1
    else available += 1
  }
  return { available, out_of_service: outOfService }
}

export interface ExtraRevenueLine {
  revenue_date: string
  line_type: string
  amount: number
  refund_amount: number
}

export interface PassengerDay {
  flight_date: string
  boarded: number
}

export interface ExtraRevenuePeriod {
  period: string
  by_type: Record<string, number>
  /** Refunds per line type, so the By type table can show revenue, refunds and net for each type. */
  refunds_by_type: Record<string, number>
  gross: number
  refunds: number
  net: number
  passengers: number
  per_passenger: number | null
}

/**
 * Extra revenue per period, by line type, with refunds taken off. Passengers are the boarded passengers of the same
 * period, so the per-passenger figure is extra revenue divided by passengers flown.
 */
export function extraRevenuePeriods(lines: ExtraRevenueLine[], passengers: PassengerDay[], group: PeriodGroup): ExtraRevenuePeriod[] {
  const byPeriod = new Map<string, ExtraRevenuePeriod>()
  const get = (period: string): ExtraRevenuePeriod => {
    let entry = byPeriod.get(period)
    if (!entry) {
      entry = { period, by_type: {}, refunds_by_type: {}, gross: 0, refunds: 0, net: 0, passengers: 0, per_passenger: null }
      byPeriod.set(period, entry)
    }
    return entry
  }
  for (const line of lines) {
    const entry = get(periodOf(line.revenue_date, group))
    entry.by_type[line.line_type] = (entry.by_type[line.line_type] ?? 0) + line.amount
    entry.gross += line.amount
    entry.refunds += line.refund_amount
    entry.refunds_by_type[line.line_type] = (entry.refunds_by_type[line.line_type] ?? 0) + line.refund_amount
  }
  for (const day of passengers) get(periodOf(day.flight_date, group)).passengers += day.boarded
  return [...byPeriod.values()]
    .map((entry) => {
      const net = entry.gross - entry.refunds
      return { ...entry, net, per_passenger: rate(net, entry.passengers) }
    })
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
}

export interface NoShowFlight {
  booked: number
  boarded: number
  denied: number
  no_show: number
}

/** The no-show rate is no-shows over booked passengers. Cancelled and not-yet-closed flights are never counted. */
export function noShowRate(flight: NoShowFlight): number | null {
  return rate(flight.no_show, flight.booked)
}
