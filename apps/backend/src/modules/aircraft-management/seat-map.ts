import type { CabinClass, SeatLayout } from './dto/layout.dto'

export type SeatMapCabin = {
  cabin_class: CabinClass
  columns: string[]
  aisle_after: string[]
}

export type SeatMapSeat = {
  seat: string
  row: number
  column: string
  cabin_class: CabinClass
  seat_type: string
}

export type SeatMap = {
  cabins: SeatMapCabin[]
  seats: SeatMapSeat[]
}

export type CabinCapacity = {
  cabin_class: CabinClass
  seats: number
  blocked: number
  sellable: number
}

export type CapacitySummary = {
  cabins: CabinCapacity[]
  total_seats: number
  total_sellable: number
}

/** Expands a stored layout into the individual seats it describes. */
export function expandSeatMap(layout: SeatLayout | null | undefined): SeatMap {
  if (!layout || !Array.isArray(layout.cabins) || layout.cabins.length === 0) {
    return { cabins: [], seats: [] }
  }

  const cabins: SeatMapCabin[] = []
  const seats: SeatMapSeat[] = []

  for (const cabin of layout.cabins) {
    cabins.push({
      cabin_class: cabin.cabin_class,
      columns: cabin.columns,
      aisle_after: cabin.aisle_after ?? [],
    })

    const skipRows = new Set(cabin.skip_rows ?? [])
    const rowTypes: Record<string, string> = {}
    for (const [type, rows] of Object.entries(cabin.row_types ?? {})) {
      for (const row of rows) {
        rowTypes[row] = type
      }
    }

    const blockedSeats = new Set(cabin.blocked_seats ?? [])

    for (let row = cabin.first_row; row <= cabin.last_row; row++) {
      if (skipRows.has(row)) continue
      for (const column of cabin.columns) {
        const seat = `${row}${column}`
        const seatType = blockedSeats.has(seat) ? 'blocked' : (rowTypes[row] ?? 'normal')
        seats.push({ seat, row, column, cabin_class: cabin.cabin_class, seat_type: seatType })
      }
    }
  }

  return { cabins, seats }
}

/** Counts seats per cabin; blocked seats stay visible but are not sellable. */
export function computeCapacity(layout: SeatLayout | null | undefined): CapacitySummary {
  const { seats } = expandSeatMap(layout)
  const perCabin = new Map<CabinClass, { seats: number; blocked: number; sellable: number }>()

  for (const seat of seats) {
    const counts = perCabin.get(seat.cabin_class) ?? { seats: 0, blocked: 0, sellable: 0 }
    counts.seats += 1
    if (seat.seat_type === 'blocked') {
      counts.blocked += 1
    } else {
      counts.sellable += 1
    }
    perCabin.set(seat.cabin_class, counts)
  }

  return {
    cabins: [...perCabin.entries()].map(([cabin_class, counts]) => ({ cabin_class, ...counts })),
    total_seats: seats.length,
    total_sellable: seats.filter((seat) => seat.seat_type !== 'blocked').length,
  }
}

/** Total seats of a layout, used to show a type's capacity without expanding every seat. */
export function countLayoutSeats(layout: SeatLayout | null | undefined): number {
  if (!layout || !Array.isArray(layout.cabins)) return 0
  let total = 0
  for (const cabin of layout.cabins) {
    const rows = Math.max(cabin.last_row - cabin.first_row + 1, 0)
    const skipped = new Set(cabin.skip_rows ?? []).size
    total += Math.max(rows - skipped, 0) * cabin.columns.length
  }
  return total
}
