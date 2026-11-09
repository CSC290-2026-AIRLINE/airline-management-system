import { Link } from '@tanstack/react-router'
import type { BookingStatus } from '../api/types'
import { useBooking } from '../api/useBooking'
import { StatusChip, type ChipTone } from '../components/StatusChip'
import { formatDate, formatMoney } from '../lib/format'
import controls from '../styles/controls.module.css'
import styles from './BookingDetailPage.module.css'
import '../styles/tokens.css'

const CHIP: Record<BookingStatus, { label: string; tone: ChipTone }> = {
  held: { label: 'Held', tone: 'held' },
  confirmed: { label: 'Confirmed', tone: 'confirmed' },
  cancelled: { label: 'Cancelled', tone: 'cancelled' },
  expired: { label: 'Expired', tone: 'expired' },
}

/**
 * The B12 Booking Detail page is not built yet. My Trips needs a destination for "View trip", so this
 * placeholder shows the summary of the booking until the flights table, the seats and the tickets arrive.
 */
export function BookingDetailPage({ reference }: { reference: string }) {
  const { booking, error, isLoading } = useBooking(reference)

  if (isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.messageCard} aria-busy="true">
            <h1>Loading booking…</h1>
          </section>
        </div>
      </main>
    )
  }

  if (error || !booking) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.messageCard}>
            <h1>We couldn&apos;t find booking {reference}</h1>
            <p className={styles.muted}>Check the reference or go back to your trips.</p>
            <div className={styles.actions}>
              <Link to="/bookings" className={controls.secondary}>
                Go to My Trips
              </Link>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const chip = CHIP[booking.status]
  const party = `${booking.passengers.length} passenger${booking.passengers.length === 1 ? '' : 's'}`

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link to="/bookings" className={styles.backLink}>
          ← My Trips
        </Link>

        <header className={styles.header}>
          <div className={styles.titleRow}>
            <h1>Booking {booking.reference}</h1>
            <StatusChip label={chip.label} tone={chip.tone} />
          </div>
          <p className={styles.muted}>
            Booked {formatDate(booking.bookedAt)} · {party} · {formatMoney(booking.total, booking.currency)}
          </p>
        </header>

        <section className={styles.card}>
          <h2>Booking detail</h2>
          <p className={styles.muted}>
            The flights, the seats, the ticket numbers and the cancellation options of this booking are still being built. The booking
            reference above works, and the full details will show up here.
          </p>
          <div className={styles.actions}>
            {booking.status === 'held' ? (
              <Link to="/review-pay/$reference" params={{ reference: booking.reference }} className={controls.primary}>
                Complete payment
              </Link>
            ) : null}
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
