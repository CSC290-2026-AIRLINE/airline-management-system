import { Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import type { Cabin, SeatDefinition, SeatMap, SeatMapPort, SeatRow, SeatType } from '../contracts'

const CABINS: Cabin[] = ['first', 'business', 'premium_economy', 'economy']
const GRID_LETTERS = 'ABCDEFGHJK'
function invalidLayout(): never {
  throw new BookingError('SEAT_NOT_ALLOWED', 'The aircraft seat layout is unavailable. Please contact the airline.', 422)
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidLayout()
  return value as Record<string, unknown>
}
function strings(value: unknown, pattern: RegExp): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string' && pattern.test(item)))
    return invalidLayout()
  return value
}
function rowNumbers(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 200)
  )
    return invalidLayout()
  return value
}
function seatType(value: unknown): SeatType {
  if (value === 'normal' || value === 'standard') return 'standard'
  if (value === 'exit_row' || value === 'exit') return 'exit'
  if (value === 'extra_legroom') return 'extra_legroom'
  return invalidLayout()
}

// Translate the stored aircraft layout at the port boundary. Accept the seeded Feature 3 layout and Feature 9's
// cabin_class/first_row/last_row format. Never substitute a generic aircraft when a stored layout is invalid.
export function aircraftSeatMap(layout: unknown, aircraftTypeId: string): SeatMap {
  const stored = record(layout)
  let cabins = stored.cabins
  // Databases seeded before the seed moved to the cabin format still hold rows/seats_per_row, and the layout cannot be
  // changed in place. Letter those seats as check-in does (no I) so both modules agree on codes.
  const perRow = stored.seats_per_row
  const columns =
    stored.columns ??
    (typeof perRow === 'number' && Number.isInteger(perRow) && perRow >= 1 && perRow <= GRID_LETTERS.length
      ? [...GRID_LETTERS.slice(0, perRow)]
      : undefined)
  // Earlier demo aircraft store a single economy cabin as rows/columns, plus typed row lists.
  if (cabins === undefined && typeof stored.rows === 'number' && Array.isArray(columns)) {
    const types: Record<string, SeatType> = {}
    for (const [key, type] of [
      ['extraLegroomRows', 'extra_legroom'],
      ['exitRows', 'exit'],
    ] as const) {
      for (const row of rowNumbers(stored[key] ?? [])) {
        if (types[row]) return invalidLayout()
        types[row] = type
      }
    }
    cabins = [
      {
        cabin: 'economy',
        rows: [1, stored.rows],
        columns,
        seatTypes: types,
        blocked_seats: stored.blockedSeats ?? [],
        ...(stored.aisle_after ? { aisle_after: stored.aisle_after } : {}),
      },
    ]
  }
  if (!Array.isArray(cabins) || !cabins.length || cabins.length > 8) return invalidLayout()
  const rows = new Map<number, SeatRow>()
  const capacities = new Map<Cabin, number>()
  let count = 0
  for (const value of cabins) {
    const cabin = record(value)
    const name = cabin.cabin_class ?? cabin.cabin
    if (!CABINS.includes(name as Cabin)) return invalidLayout()
    const cabinName = name as Cabin
    const range = cabin.rows
    const first = cabin.first_row ?? (Array.isArray(range) ? range[0] : undefined)
    const last = cabin.last_row ?? (Array.isArray(range) ? range[1] : undefined)
    // Seat assignment codes are constrained by the central schema to rows 1–99.
    if (
      typeof first !== 'number' ||
      typeof last !== 'number' ||
      !Number.isInteger(first) ||
      !Number.isInteger(last) ||
      first < 1 ||
      last > 99 ||
      first > last
    )
      return invalidLayout()
    const columns = strings(cabin.columns, /^[A-Z]$/)
    if (!columns.length || columns.length > 10 || new Set(columns).size !== columns.length) return invalidLayout()
    const skipped = new Set(rowNumbers(cabin.skip_rows ?? []))
    const blocked = new Set(strings(cabin.blocked_seats ?? [], /^[1-9][0-9]{0,2}[A-Z]$/))
    const blockedColumns = new Set(strings(cabin.blockedColumns ?? [], /^[A-Z]$/))
    if ([...blockedColumns].some((column) => !columns.includes(column))) return invalidLayout()
    for (const code of blocked) {
      const row = Number(code.slice(0, -1))
      if (row < first || row > last || skipped.has(row) || !columns.includes(code.slice(-1))) return invalidLayout()
    }
    const aisles = strings(cabin.aisle_after ?? (cabin.cabin_class ? [] : [columns[Math.ceil(columns.length / 2) - 1]]), /^[A-Z]$/)
    if (aisles.some((column) => !columns.includes(column))) return invalidLayout()
    const types = new Map<number, SeatType>()
    for (const [type, values] of Object.entries(record(cabin.row_types ?? {}))) {
      for (const row of rowNumbers(values)) {
        if (types.has(row)) return invalidLayout()
        types.set(row, seatType(type))
      }
    }
    for (const [row, type] of Object.entries(record(cabin.seatTypes ?? {}))) types.set(Number(row), seatType(type))
    if (
      [...skipped, ...types.keys()].some((row) => row < first || row > last || !Number.isInteger(row)) ||
      [...types.keys()].some((row) => skipped.has(row))
    )
      return invalidLayout()
    for (let row = first; row <= last; row++) {
      if (skipped.has(row)) continue
      if (rows.has(row)) return invalidLayout()
      const seats = columns.map((column, index): SeatDefinition => ({
        seatCode: `${row}${column}`,
        row,
        column,
        cabin: cabinName,
        type: types.get(row) ?? 'standard',
        blocked: blocked.has(`${row}${column}`) || blockedColumns.has(column),
        aisleBefore: index > 0 && aisles.includes(columns[index - 1]),
      }))
      count += seats.length
      if (count > 1000) return invalidLayout()
      capacities.set(cabinName, (capacities.get(cabinName) ?? 0) + seats.filter((seat) => !seat.blocked).length)
      rows.set(row, { row, seats })
    }
  }
  if (!count) return invalidLayout()
  return {
    aircraftTypeId,
    cabins: [...capacities].map(([cabin, capacity]) => ({ cabin, capacity })),
    rows: [...rows.values()].sort((a, b) => a.row - b.row),
  }
}

@Injectable()
export class AircraftSeatMapAdapter implements SeatMapPort {
  constructor(private readonly db: DbService) {}
  async getSeatMap(flightId: string, aircraftTypeId?: string): Promise<SeatMap> {
    if (aircraftTypeId) {
      const type = await this.db.aircraft_type.findUnique({ where: { id: aircraftTypeId }, select: { id: true, layout: true } })
      if (!type) throw new NotFoundException('Aircraft type for flight event not found')
      return aircraftSeatMap(type.layout, type.id)
    }
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      select: {
        aircraft: { select: { deleted_at: true, aircraft_type: { select: { id: true, layout: true, deleted_at: true } } } },
      },
    })
    if (!flight) throw new NotFoundException('Flight not found')
    if (flight.aircraft.deleted_at || flight.aircraft.aircraft_type.deleted_at) return invalidLayout()
    return aircraftSeatMap(flight.aircraft.aircraft_type.layout, flight.aircraft.aircraft_type.id)
  }
}
