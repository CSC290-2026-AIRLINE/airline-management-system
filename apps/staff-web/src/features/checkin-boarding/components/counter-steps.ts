// The passenger steps the agent does at the counter: the passport lines and the seat choice.
import type { Cabin, SeatMap, SeatType } from '../api/types.ts'
import { formatBaht } from '../domain/format.ts'

/** The length of one line of the machine-readable zone of a passport. */
export const MRZ_LENGTH = 44

/** A passport line as it is typed or pasted: no spaces, capitals. */
export function mrzLine(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase()
}

const TYPE_LABELS: Partial<Record<SeatType, string>> = { exit: 'exit row', front: 'front row' }

/** The free seats of the passenger's cabin, each with its row type and its fee when it has one. */
export function seatOptions(map: SeatMap, cabin: Cabin): Array<{ code: string; label: string }> {
  return map.rows
    .flatMap((row) => row.seats)
    .filter((seat) => seat.cabin === cabin && seat.status === 'free')
    .map((seat) => ({
      code: seat.code,
      label: [seat.code, TYPE_LABELS[seat.type], seat.fee > 0 ? formatBaht(seat.fee) : null].filter(Boolean).join(' · '),
    }))
}
