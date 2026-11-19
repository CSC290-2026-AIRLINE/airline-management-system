import type { Cabin, SeatMap as SeatMapModel } from '../api/types.ts'
import { cabinName, formatBaht } from '../format.ts'
import styles from './seatmap.module.css'

const LETTERS = 'ABCDEF'

/** A..C on the left of the aisle, D..F on the right. */
function columnOf(letter: string): number {
  const index = LETTERS.indexOf(letter)
  if (index < 0) return 2
  return index < 3 ? index + 2 : index + 3
}

/** The cabins on the map that are not the passenger's, front to back, as the legend names them. */
function otherCabinsOf(map: SeatMapModel, cabin: Cabin): string[] {
  const names: string[] = []
  for (const row of map.rows) {
    for (const seat of row.seats) {
      const name = cabinName(seat.cabin)
      if (seat.cabin !== cabin && !names.includes(name)) names.push(name)
    }
  }
  return names
}

export function SeatMap({
  map,
  cabin,
  selected,
  onPick,
  frontFee,
  exitFee,
  disabled = false,
}: {
  map: SeatMapModel
  /** The passenger's own cabin: the seats of every other cabin are shown but cannot be picked. */
  cabin: Cabin
  selected: string | null
  onPick: (code: string) => void
  frontFee: number
  exitFee: number
  disabled?: boolean
}) {
  const otherCabins = otherCabinsOf(map, cabin)
  return (
    <div className={styles.wrapper}>
      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} data-status="free" /> Free
        </li>
        <li>
          <span className={styles.swatch} data-status="paid" /> Paid (front {formatBaht(frontFee)}, exit {formatBaht(exitFee)})
        </li>
        <li>
          <span className={styles.swatch} data-status="taken" /> Taken
        </li>
        <li>
          <span className={styles.swatch} data-status="mine" /> Your seat
        </li>
        {otherCabins.length > 0 ? (
          <li>
            <span className={styles.swatch} data-status="other-cabin" /> {otherCabins.join(', ')} (other{' '}
            {otherCabins.length > 1 ? 'cabins' : 'cabin'})
          </li>
        ) : null}
      </ul>

      <div className={styles.well}>
        <div className={styles.map} role="group" aria-label="Seat map">
          <div className={styles.letters} aria-hidden="true">
            {LETTERS.split('').map((letter) => (
              <span key={letter} className={styles.letter} style={{ gridColumn: columnOf(letter) }}>
                {letter}
              </span>
            ))}
          </div>

          {map.rows.map((row) => {
            const exitSeat = row.seats.find((seat) => seat.type === 'exit')
            return (
              <div key={row.row} className={styles.row}>
                {row.exitRow ? (
                  <span className={styles.exit} style={{ gridColumn: '1 / -1' }}>
                    Exit row · {formatBaht(exitSeat?.fee ?? 0)}
                  </span>
                ) : null}
                <span className={styles.rowNumber} style={{ gridColumn: 1, gridRow: 2 }}>
                  {row.row}
                </span>
                {LETTERS.split('').map((letter) => {
                  const seat = row.seats.find((candidate) => candidate.letter === letter)
                  if (!seat) {
                    return <span key={letter} className={styles.blank} style={{ gridColumn: columnOf(letter), gridRow: 2 }} />
                  }
                  // Your own seat is not a pick: re-holding it would answer SEAT_TAKEN against the database.
                  const taken = seat.status === 'taken' || seat.status === 'held' || seat.status === 'blocked' || seat.status === 'mine'
                  return (
                    <button
                      key={seat.code}
                      type="button"
                      className={styles.seat}
                      data-status={seat.status}
                      data-paid={seat.fee > 0}
                      data-other-cabin={seat.cabin !== cabin}
                      style={{ gridColumn: columnOf(seat.letter), gridRow: 2 }}
                      aria-pressed={selected === seat.code}
                      aria-label={`Seat ${seat.code}${seat.cabin !== cabin ? `, ${cabinName(seat.cabin)}` : seat.fee > 0 ? `, ${formatBaht(seat.fee)}` : ''}`}
                      disabled={disabled || taken}
                      onClick={() => onPick(seat.code)}
                    >
                      {seat.letter}
                    </button>
                  )
                })}
                <span className={styles.rowNumber} style={{ gridColumn: 5, gridRow: 2 }} aria-hidden="true">
                  {row.row}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
