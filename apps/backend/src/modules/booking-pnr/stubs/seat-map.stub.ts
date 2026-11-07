import { Injectable } from '@nestjs/common'
import type { SeatDefinition, SeatMap, SeatMapPort, SeatRow, SeatType } from '../contracts'

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
    const seats: SeatDefinition[] = COLUMNS.map((column) => ({
      seatCode: `${row}${column}`,
      row,
      column,
      type,
      available: true,
    }))
    return { row, seats }
  })
}

@Injectable()
export class SeatMapStub implements SeatMapPort {
  getSeatMap(): Promise<SeatMap> {
    return Promise.resolve({ rows: buildRows() })
  }
}
