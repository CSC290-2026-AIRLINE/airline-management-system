import type { SeatMap as SeatMapModel } from '../api/types.ts'
import { formatBaht } from '../format.ts'
import styles from './seatmap.module.css'

const LETTERS = 'ABCDEF'

/** A..C on the left of the aisle, D..F on the right. */
function columnOf(letter: string): number {
  const index = LETTERS.indexOf(letter)
  if (index < 0) return 2
  return index < 3 ? index + 2 : index + 3
}

export function SeatMap({
  map,
  selected,
  onPick,
  disabled = false,
}: {
  map: SeatMapModel
  selected: string | null
  onPick: (code: string) => void
  disabled?: boolean
}) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.map} role="group" aria-label="Seat map">
        {map.rows.map((row) => (
          <div key={row.row} className={styles.row}>
            {row.exitRow ? (
              <span className={styles.exit} style={{ gridColumn: '1 / -1' }}>
                Exit row · extra legroom
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
              const taken = seat.status === 'taken' || seat.status === 'held' || seat.status === 'blocked'
              return (
                <button
                  key={seat.code}
                  type="button"
                  className={styles.seat}
                  data-status={seat.status}
                  data-paid={seat.fee > 0}
                  style={{ gridColumn: columnOf(seat.letter), gridRow: 2 }}
                  aria-pressed={selected === seat.code}
                  aria-label={`Seat ${seat.code}${seat.fee > 0 ? `, ${formatBaht(seat.fee)}` : ''}`}
                  disabled={disabled || taken}
                  onClick={() => onPick(seat.code)}
                >
                  {seat.letter}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} data-status="free" /> Free
        </li>
        <li>
          <span className={styles.swatch} data-status="taken" /> Taken
        </li>
        <li>
          <span className={styles.swatch} data-status="blocked" /> Other cabin
        </li>
        <li>
          <span className={styles.swatch} data-status="paid" /> Extra fee
        </li>
        <li>
          <span className={styles.swatch} data-status="mine" /> Your seat
        </li>
      </ul>
    </div>
  )
}
