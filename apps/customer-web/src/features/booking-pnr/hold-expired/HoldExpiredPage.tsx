import { Link } from '@tanstack/react-router'
import { useBooking } from '../api/useBooking'
import { heldSeatCount } from '../lib/booking'
import { ConfirmedState } from '../review-pay/ConfirmedState'
import type { HoldExpiredReason } from './types'
import styles from './HoldExpiredPage.module.css'
import controls from '../styles/controls.module.css'
import '../styles/tokens.css'

export function HoldExpiredPage({ reference, reason }: { reference: string; reason: HoldExpiredReason }) {
  const { booking, error } = useBooking(reference)

  if (booking?.status === 'confirmed') {
    return <ConfirmedState booking={booking} />
  }

  const holdStillActive = booking?.status === 'held' && Date.parse(booking.holdExpiresAt) > Date.parse(booking.serverNow)
  if (holdStillActive) {
    return <ActiveHoldState reference={reference} />
  }

  if (error?.status === 404) {
    return <NotFoundState reference={reference} />
  }

  const seatCount = booking ? heldSeatCount(booking) : 0
  const seatLabel = seatCount > 0 ? `${seatCount} held seat${seatCount === 1 ? '' : 's'}` : 'held seats'
  const chip = reason === 'refunded' ? 'Payment refunded' : reason === 'cancelled' ? 'Booking cancelled' : 'Hold expired'
  const title =
    reason === 'refunded' ? 'Your seats were gone' : reason === 'cancelled' ? 'Your booking was cancelled' : 'Your seats were released'
  const body =
    reason === 'refunded'
      ? `Booking ${reference} expired before payment and its seats were no longer available. The payment was refunded in full.`
      : reason === 'cancelled'
        ? `Booking ${reference} was cancelled before payment, so the ${seatLabel} ${seatCount === 1 ? 'was' : 'were'} released. Nothing was charged.`
        : `Booking ${reference} was not paid within 15 minutes, so the ${seatLabel} ${seatCount === 1 ? 'is' : 'are'} back on sale and the booking is marked expired. Nothing was charged.`

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.chip}>{chip}</span>
          <h1>{title}</h1>
          <p className={styles.body}>{body}</p>
          <div className={styles.actions}>
            <Link to="/search" className={controls.primary}>
              Search again
            </Link>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
          <p className={styles.note}>Prices and seat counts may have changed. If the seats are gone, search will show what is left.</p>
        </section>
      </div>
    </main>
  )
}

function ActiveHoldState({ reference }: { reference: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.neutralChip}>Hold active</span>
          <h1>Your hold is still active</h1>
          <p className={styles.body}>Booking {reference} has not expired yet. Return to Review &amp; pay to finish.</p>
          <div className={styles.actions}>
            <Link to="/review-pay/$reference" params={{ reference }} className={controls.primary}>
              Return to Review &amp; pay
            </Link>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.card}>
          <span className={styles.chip}>Not found</span>
          <h1>We couldn&apos;t find booking {reference}</h1>
          <p className={styles.body}>Check the reference or go back to your trips.</p>
          <div className={styles.actions}>
            <Link to="/bookings" className={controls.primary}>
              Go to My Trips
            </Link>
            <Link to="/search" className={controls.secondary}>
              Search flights
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
