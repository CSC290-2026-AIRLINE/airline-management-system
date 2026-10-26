import type { CabinClass, CabinLayout } from './types'

export const CABIN_CLASS_LABELS: Record<CabinClass, string> = {
  first: 'First Class',
  business: 'Business Class',
  premium_economy: 'Premium Economy Class',
  economy: 'Economy Class',
}

/** The classes the design offers in the cabin form. */
export const CABIN_CLASS_OPTIONS: CabinClass[] = ['first', 'business', 'economy']

/** The short class names the design writes in the cabin list and in the seat map. */
export const CABIN_CLASS_NAMES: Record<CabinClass, string> = {
  first: 'First',
  business: 'Business',
  premium_economy: 'Premium Economy',
  economy: 'Economy',
}

/** The seat arrangements the design offers; `|` in the label marks the aisle. */
export interface SeatLayoutOption {
  id: string
  label: string
  columns: string[]
  aisleAfter: string[]
}

export const SEAT_LAYOUT_OPTIONS: SeatLayoutOption[] = [
  { id: '2-2', label: '2 – 2 (AB | DE)', columns: ['A', 'B', 'D', 'E'], aisleAfter: ['B'] },
  { id: '3-3', label: '3 – 3 (ABC | DEF)', columns: ['A', 'B', 'C', 'D', 'E', 'F'], aisleAfter: ['C'] },
  { id: '2-3-2', label: '2 – 3 – 2 (AB | CDE | FG)', columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], aisleAfter: ['B', 'E'] },
]

/** The row types a row number can cycle through. */
export const ROW_TYPES = ['exit_row', 'extra_legroom', 'normal'] as const
export type RowType = (typeof ROW_TYPES)[number]

export const ROW_TYPE_LABELS: Record<RowType, string> = {
  exit_row: 'Exit row',
  extra_legroom: 'Extra legroom',
  normal: 'Normal row',
}

/** `2-2` for a 2-2 layout, `3-4` for a 3-4 layout; the aisle splits the columns into groups. */
export function layoutSummary(columns: string[], aisleAfter: string[] = []): string {
  const groups: string[] = []
  let current = 0

  for (const column of columns) {
    current += 1
    if (aisleAfter.includes(column)) {
      groups.push(String(current))
      current = 0
    }
  }
  if (current > 0) {
    groups.push(String(current))
  }

  return groups.join('-')
}

/** One cabin as the design writes it in the cabin list: `Economy (rows 4-26 · 3-3)`. */
export function cabinSummary(cabin: Pick<CabinLayout, 'cabin_class' | 'first_row' | 'last_row' | 'columns' | 'aisle_after'>) {
  return `${CABIN_CLASS_NAMES[cabin.cabin_class]} (rows ${cabin.first_row}-${cabin.last_row} · ${layoutSummary(cabin.columns, cabin.aisle_after ?? [])})`
}

/** One cabin as the design writes it above the seats: `ECONOMY · rows 4-26 · 3-3`. */
export function cabinMapSummary(cabin: Pick<CabinLayout, 'cabin_class' | 'first_row' | 'last_row' | 'columns' | 'aisle_after'>) {
  return `${CABIN_CLASS_NAMES[cabin.cabin_class].toUpperCase()} · rows ${cabin.first_row}-${cabin.last_row} · ${layoutSummary(cabin.columns, cabin.aisle_after ?? [])}`
}

/** The column the aisle that holds the row number sits behind: the middle of the cabin. */
export function middleAisleAfter(columns: string[], aisleAfter: string[] = []): string | null {
  const aisles = columns.filter((column) => aisleAfter.includes(column))
  if (aisles.length === 0) {
    return null
  }

  const middle = columns.length / 2
  let closest = aisles[0]
  let closestDistance = Number.POSITIVE_INFINITY

  for (const column of aisles) {
    const distance = Math.abs(columns.indexOf(column) + 1 - middle)
    if (distance < closestDistance) {
      closest = column
      closestDistance = distance
    }
  }

  return closest
}

/** The type of one row, taken from the `row_types` map of a cabin. */
export function rowTypeOf(cabin: Pick<CabinLayout, 'row_types'>, row: number): RowType {
  for (const type of ROW_TYPES) {
    if (cabin.row_types?.[type]?.includes(row)) {
      return type
    }
  }
  return 'normal'
}

/** The number of rows a cabin has, without the skipped ones. */
export function rowCount(cabin: Pick<CabinLayout, 'first_row' | 'last_row' | 'skip_rows'>): number {
  const skipped = new Set(cabin.skip_rows ?? []).size
  return Math.max(cabin.last_row - cabin.first_row + 1 - skipped, 0)
}

/** Seats, blocked seats and sellable seats of a layout. */
export function capacityOf(cabins: CabinLayout[]): { total: number; blocked: number; sellable: number } {
  let total = 0
  let blocked = 0

  for (const cabin of cabins) {
    total += rowCount(cabin) * cabin.columns.length
    blocked += (cabin.blocked_seats ?? []).length
  }

  return { total, blocked, sellable: total - blocked }
}
