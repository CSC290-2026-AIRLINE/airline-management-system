import type { CheckInView } from '../api/types.ts'
import { formatBaht, formatDay, formatTime } from '../format.ts'
import styles from './flow.module.css'

function cabinLabel(cabin: string): string {
  const label = cabin.replace('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function Summary({ checkIn }: { checkIn: CheckInView }) {
  const { flight, passenger, booking, seat } = checkIn
  // The seat fee is what the passenger picked; the bags are weighed at the counter, so their excess is unpaid until then.
  const extraToPay = (seat?.fee ?? 0) + (checkIn.excessFee ?? 0)
  const rows: Array<[string, string]> = [
    ['Booking ref', booking.pnr],
    ['Passenger', `${passenger.firstName} ${passenger.lastName}`],
    ['Departs', `${formatTime(flight.depAt)} · ${formatDay(flight.serviceDate)}`],
    ['Cabin', cabinLabel(passenger.cabin)],
    ['Seat', seat ? `${seat.code} (${seat.type})` : 'Not chosen'],
    ['Checked bags', checkIn.declaredBags === null ? 'Not declared' : String(checkIn.declaredBags)],
    ['Extra to pay', formatBaht(extraToPay)],
  ]

  return (
    <aside className={styles.summary} aria-label="Your booking">
      <h2 className={styles.summaryTitle}>
        {flight.flightNumber} · {flight.origin.city} to {flight.destination.city}
      </h2>
      <dl className={styles.summaryRows}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.summaryRow}>
            <dt className={styles.summaryLabel}>{label}</dt>
            <dd className={styles.summaryValue}>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
