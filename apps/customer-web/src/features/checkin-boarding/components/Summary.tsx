import type { CheckInView } from '../api/types.ts'
import { formatBaht, formatDay, formatTime } from '../format.ts'
import styles from './flow.module.css'

function cabinLabel(cabin: string): string {
  return cabin.replace('_', ' ')
}

export function Summary({ checkIn }: { checkIn: CheckInView }) {
  const { flight, passenger, booking, seat } = checkIn
  const rows: Array<[string, string]> = [
    ['Flight', `${flight.flightNumber} · ${flight.origin.city} to ${flight.destination.city}`],
    ['Date', `${formatDay(flight.serviceDate)} · departs ${formatTime(flight.depAt)}`],
    ['Booking ref', booking.pnr],
    ['Passenger', `${passenger.firstName} ${passenger.lastName}`],
    ['Cabin', cabinLabel(passenger.cabin)],
    ['Seat', seat ? `${seat.code} (${seat.type})` : 'Not chosen yet'],
    ['Gate', flight.gate ? flight.gate.code : 'Assigned at the gate'],
    ['Boarding', formatTime(flight.boardingAt)],
    ['Checked bags', checkIn.declaredBags === null ? 'Not declared yet' : String(checkIn.declaredBags)],
  ]

  return (
    <aside className={styles.summary} aria-label="Your booking">
      <div className={styles.summaryRoute}>
        <span className={styles.summaryCode}>{flight.origin.code}</span>
        <span className={styles.summaryArrow} aria-hidden="true">
          →
        </span>
        <span className={styles.summaryCode}>{flight.destination.code}</span>
      </div>
      <dl className={styles.summaryRows}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>{label}</dt>
            <dd className={styles.summaryValue}>{value}</dd>
          </div>
        ))}
      </dl>
      {seat && seat.fee > 0 ? (
        <p className={styles.summaryFee}>
          Extra to pay for seat {seat.code}: <strong>{formatBaht(seat.fee)}</strong>
        </p>
      ) : null}
    </aside>
  )
}
