import type { Cabin, SeatDefinition, SeatMapCabin, SeatRow, SeatType } from '../contracts'

const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface DemoCabin {
  cabin: Cabin
  rows: { from: number; to: number }
  columns: string[]
  seatTypes?: Record<number, SeatType>
  blockedColumns?: string[]
}

export const DEMO_CABINS: DemoCabin[] = [
  { cabin: 'first', rows: { from: 1, to: 1 }, columns: COLUMNS, blockedColumns: ['E', 'F'] },
  { cabin: 'business', rows: { from: 2, to: 4 }, columns: COLUMNS },
  {
    cabin: 'premium_economy',
    rows: { from: 5, to: 7 },
    columns: COLUMNS,
    seatTypes: { 5: 'extra_legroom', 6: 'extra_legroom' },
  },
  {
    cabin: 'economy',
    rows: { from: 8, to: 30 },
    columns: COLUMNS,
    seatTypes: { 8: 'extra_legroom', 9: 'extra_legroom', 10: 'extra_legroom', 12: 'exit' },
  },
]

export const DEMO_ROW_COUNT = Math.max(...DEMO_CABINS.map((cabin) => cabin.rows.to))

export function buildDemoRows(): SeatRow[] {
  return DEMO_CABINS.flatMap((cabin) =>
    Array.from({ length: cabin.rows.to - cabin.rows.from + 1 }, (_, index) => {
      const row = cabin.rows.from + index
      const type = cabin.seatTypes?.[row] ?? 'standard'
      const seats = cabin.columns.map((column): SeatDefinition => ({
        seatCode: `${row}${column}`,
        row,
        column,
        cabin: cabin.cabin,
        type,
        blocked: cabin.blockedColumns?.includes(column) ?? false,
      }))
      return { row, seats }
    }),
  ).sort((a, b) => a.row - b.row)
}

export function demoCabinCapacity(cabin: Cabin): number {
  const definition = DEMO_CABINS.find((item) => item.cabin === cabin)
  if (!definition) throw new Error(`No demo layout is defined for cabin ${cabin}`)

  const rowCount = definition.rows.to - definition.rows.from + 1
  return rowCount * (definition.columns.length - (definition.blockedColumns?.length ?? 0))
}

export function demoAwardLimit(cabin: Cabin): number {
  return cabin === 'economy' ? 10 : 0
}

export function demoCabinSummaries(): SeatMapCabin[] {
  return DEMO_CABINS.map(({ cabin }) => ({ cabin, capacity: demoCabinCapacity(cabin) }))
}

export function demoAircraftLayout() {
  return {
    rows: DEMO_ROW_COUNT,
    columns: COLUMNS,
    cabins: DEMO_CABINS.map(({ cabin, rows, columns, seatTypes, blockedColumns }) => ({
      cabin,
      rows: [rows.from, rows.to],
      columns,
      seatTypes: seatTypes ?? {},
      blockedColumns: blockedColumns ?? [],
    })),
  }
}
