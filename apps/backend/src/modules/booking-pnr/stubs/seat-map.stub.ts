import { Injectable } from '@nestjs/common'
import type { SeatDefinition, SeatMap, SeatMapPort, SeatRow, SeatType } from '../contracts'

// Stub until Feature 9 (PR #32) lands: one all-economy 3-3 layout, rows 1-30, row 12 exit, rows 1-3 extra legroom.
const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F']
const ROW_COUNT = 30
const EXIT_ROW = 12
const EXTRA_LEGROOM_LAST_ROW = 3

function seatType(row: number): SeatType {
  if (row === EXIT_ROW) return 'exit'
  if (row <= EXTRA_LEGROOM_LAST_ROW) return 'extra_legroom'
  return 'standard'
}

function buildRows(): SeatRow[] {
  return Array.from({ length: ROW_COUNT }, (_, index) => {
    const row = index + 1
    const type = seatType(row)
    const seats = COLUMNS.map((column): SeatDefinition => ({
      seatCode: `${row}${column}`,
      row,
      column,
      cabin: 'economy',
      type,
      blocked: false,
    }))
    return { row, seats }
  })
}

@Injectable()
export class SeatMapStub implements SeatMapPort {
  getSeatMap(): Promise<SeatMap> {
    const seatMap: SeatMap = {
      cabins: [{ cabin: 'economy', capacity: ROW_COUNT * COLUMNS.length }],
      rows: buildRows(),
    }
    return Promise.resolve(seatMap)
  }
}
