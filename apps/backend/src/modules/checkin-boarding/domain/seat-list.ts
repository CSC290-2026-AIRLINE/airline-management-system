import type { Cabin, SeatType } from '../api-types'

export interface LayoutSeat {
  code: string
  row: number
  letter: string
  cabin: Cabin
  type: SeatType
  /** A seat the aircraft has but nobody may sit in. */
  blocked: boolean
}

/** Front to back, the order the cabins sit in an aircraft. */
const CABINS: Cabin[] = ['first', 'business', 'premium_economy', 'economy']
/** Feature 9's row types in feature 6's words; a row without one is a normal row. */
const ROW_TYPES: Record<string, SeatType> = { exit_row: 'exit', extra_legroom: 'front' }
/** Feature 9's own limits on a layout: a document over them is not expanded. */
const MAX_ROW = 200
const MAX_COLUMNS = 10
const LETTERS = 'ABCDEFGHJK'

const isRow = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ROW
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const seatOf = (row: number, letter: string, cabin: Cabin, rowType: SeatType | undefined, blocked: boolean): LayoutSeat => ({
  code: `${row}${letter}`,
  row,
  letter,
  cabin,
  type: rowType ?? (cabin === 'business' || cabin === 'first' ? 'business' : 'standard'),
  blocked,
})

/**
 * The seats of an aircraft, from `aircraft_type.layout`. Feature 9 writes the layout as cabins; the aircraft of the
 * shared seed are a plain grid of rows, which is split front to back into the cabins the flight sells (`capacity` is
 * the flight's `seat_inventory`). A layout that cannot be read has no seats.
 */
export function seatList(layout: unknown, capacity: Partial<Record<string, number>>): LayoutSeat[] {
  if (typeof layout !== 'object' || layout === null) return []
  const shape = layout as Record<string, unknown>
  return 'cabins' in shape ? fromCabins(shape.cabins) : fromGrid(shape, capacity)
}

function fromCabins(cabins: unknown): LayoutSeat[] {
  const seats: LayoutSeat[] = []
  for (const cabin of list(cabins) as Array<Record<string, unknown>>) {
    const cabinClass = CABINS.find((name) => name === cabin?.cabin_class)
    const columns = list(cabin?.columns).filter((column): column is string => typeof column === 'string')
    if (!cabinClass || !isRow(cabin.first_row) || !isRow(cabin.last_row) || columns.length === 0 || columns.length > MAX_COLUMNS) continue
    const skipped = new Set(list(cabin.skip_rows))
    const blocked = new Set(list(cabin.blocked_seats))
    const rowTypes = new Map<unknown, SeatType>()
    for (const [type, rows] of Object.entries((cabin.row_types as Record<string, unknown> | undefined) ?? {})) {
      if (ROW_TYPES[type]) for (const row of list(rows)) rowTypes.set(row, ROW_TYPES[type])
    }
    for (let row = cabin.first_row; row <= cabin.last_row; row++) {
      if (skipped.has(row)) continue
      for (const letter of columns) seats.push(seatOf(row, letter, cabinClass, rowTypes.get(row), blocked.has(`${row}${letter}`)))
    }
  }
  return seats
}

function fromGrid(shape: Record<string, unknown>, capacity: Partial<Record<string, number>>): LayoutSeat[] {
  const perRow = shape.seats_per_row
  const letters =
    typeof shape.letters === 'string'
      ? [...shape.letters]
      : Number.isInteger(perRow) && (perRow as number) >= 1
        ? [...LETTERS.slice(0, perRow as number)]
        : []
  if (!isRow(shape.rows) || letters.length === 0 || letters.length > MAX_COLUMNS) return []
  const exitRows = list(shape.exitRows)
  const sold = CABINS.filter((cabin) => (capacity[cabin] ?? 0) > 0)
  const cabins = sold.length > 0 ? sold : (['economy'] as Cabin[])

  const seats: LayoutSeat[] = []
  let row = 1
  for (const [index, cabin] of cabins.entries()) {
    // Each cabin takes the rows its seats need; the last one takes what is left of the aircraft.
    const last =
      index === cabins.length - 1 ? shape.rows : Math.min(shape.rows, row + Math.ceil((capacity[cabin] ?? 0) / letters.length) - 1)
    for (; row <= last; row++) {
      for (const letter of letters) seats.push(seatOf(row, letter, cabin, exitRows.includes(row) ? 'exit' : undefined, false))
    }
  }
  return seats
}
