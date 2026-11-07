// The counter's one search box and the chip filter above the passenger table.
import type { FlightSummary, StaffCheckInRow } from '../api/types.ts'

export interface CounterSearch {
  flightId?: string
  pnr?: string
  name?: string
}

export type CounterFilter = 'all' | 'not_started' | 'on_hold' | 'issues'

/** The text in the search box: a flight number, a booking ref or a surname. */
export function parseSearch(text: string, flights: FlightSummary[]): CounterSearch {
  const trimmed = text.trim()
  if (trimmed === '') return {}
  const compact = trimmed.replace(/\s+/g, '').toUpperCase()
  const flight = flights.find((item) => item.flightNumber.replace(/\s+/g, '').toUpperCase() === compact)
  if (flight) return { flightId: flight.id }
  if (/^[A-Z0-9]{6}$/.test(compact)) return { pnr: compact }
  return { name: trimmed }
}

/** The chips above the table: all passengers, the ones not started, the ones on hold and the ones with an issue. */
export function applyFilter(rows: StaffCheckInRow[], filter: CounterFilter): StaffCheckInRow[] {
  switch (filter) {
    case 'not_started':
      return rows.filter((row) => row.status === 'started')
    case 'on_hold':
      return rows.filter((row) => row.status === 'on_hold')
    case 'issues':
      return rows.filter((row) => row.issues.length > 0)
    default:
      return rows
  }
}

/**
 * A six-letter surname reads as a booking ref, so a search for "Becker" finds nobody. When that happens the
 * counter searches the same text as a name.
 */
export function fallbackQuery(parsed: CounterSearch, text: string): CounterSearch | null {
  if (!parsed.pnr) return null
  return { name: text.trim() }
}
