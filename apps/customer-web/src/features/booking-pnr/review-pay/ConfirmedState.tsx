import { Link } from '@tanstack/react-router'
import type { BookingDetail } from '../api/types'
import { formatMoney } from '../lib/format'
import styles from './ReviewPayPage.module.css'
import controls from '../styles/controls.module.css'
import '../styles/tokens.css'

export function ConfirmedState({ booking }: { booking: BookingDetail }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.confirmedCard}>
          <span className={styles.successChip}>Confirmed</span>
          <h1>Your booking is confirmed</h1>
          <p>
            Booking <strong>{booking.reference}</strong> is paid and ticketed.
          </p>
          <p className={styles.muted}>Total {formatMoney(booking.total, booking.currency)}</p>
          <div className={styles.confirmedActions}>
            <Link to="/bookings" className={controls.primary}>
              View trip
            </Link>
            <button type="button" className={controls.secondary} disabled>
              Add meals
            </button>
          </div>
          <p className={styles.note}>Meals can be added from your booking once onboard ordering is available.</p>
        </section>
      </div>
    </main>
  )
}
