import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ApiError } from '../api/client'
import type { CancelBookingResult } from '../api/types'
import { useBooking } from '../api/useBooking'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { StatusChip } from '../components/StatusChip'
import { formatDateWithYear, formatMoney } from '../lib/format'
import controls from '../styles/controls.module.css'
import { CancelBookingDialog } from './CancelBookingDialog'
import { FeatureAction } from './FeatureAction'
import { FlightsCard } from './FlightsCard'
import { PassengersCard } from './PassengersCard'
import { PaymentCard } from './PaymentCard'
import {
  bookingChip,
  CHANGE_BOOKING_DISABLED,
  CHECK_IN_DISABLED,
  COMPLAINT_DISABLED,
  LOST_BAG_DISABLED,
  MEALS_DISABLED,
  orderingLabel,
  orderingWindow,
  partyLabel,
} from './booking-detail-model'
import styles from './BookingDetailPage.module.css'
import '../styles/tokens.css'

/**
 * The Booking Detail page (B12, design frames 08 and 08a): the flights of a booking with their seats and tickets, the
 * passengers with their assistance requests, the payment and the links to the features that are not connected yet.
 */
export function BookingDetailPage({ reference }: { reference: string }) {
  const { booking, error, isLoading, reload } = useBooking(reference)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [cancelled, setCancelled] = useState<CancelBookingResult | null>(null)

  if (isLoading && !booking) {
    return <LoadingState />
  }

  if (error) {
    return error.status === 404 ? <NotFoundState reference={reference} /> : <ErrorState error={error} onRetry={() => void reload()} />
  }

  if (!booking) {
    return <NotFoundState reference={reference} />
  }

  const chip = bookingChip(booking)
  const ordering = orderingWindow(booking)
  const cancellable = booking.status === 'confirmed' || booking.status === 'held'

  function handleCancelled(result: CancelBookingResult) {
    setIsCancelOpen(false)
    setCancelled(result)
    void reload()
  }

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <Link to="/bookings" className={styles.backLink}>
            ← My Trips
          </Link>

          <header className={styles.header}>
            <div className={styles.titleBlock}>
              <div className={styles.titleRow}>
                <h1>Booking {booking.reference}</h1>
                <StatusChip label={chip.label} tone={chip.tone} />
              </div>
              <p className={styles.muted}>
                Booked {formatDateWithYear(booking.bookedAt)} · {partyLabel(booking.passengers)} ·{' '}
                {formatMoney(booking.total, booking.currency)}
              </p>
              {booking.cancelledAt ? <p className={styles.muted}>Cancelled on {formatDateWithYear(booking.cancelledAt)}.</p> : null}
            </div>

            <div className={styles.headerActions}>
              {booking.status === 'held' ? (
                <Link to="/review-pay/$reference" params={{ reference: booking.reference }} className={controls.primary}>
                  Complete payment
                </Link>
              ) : null}
              <FeatureAction label="Change booking" reason={CHANGE_BOOKING_DISABLED} className={controls.secondary} />
              <FeatureAction label="Report a problem" reason={COMPLAINT_DISABLED} className={controls.secondary} />
              {cancellable ? (
                <button type="button" className={controls.dangerOutline} onClick={() => setIsCancelOpen(true)}>
                  Cancel booking
                </button>
              ) : null}
            </div>
          </header>

          {cancelled ? <p className={styles.notice}>{cancelNotice(cancelled)}</p> : null}

          <FlightsCard booking={booking} />

          <section>
            <h2 className={styles.sectionTitle}>Check-in and boarding pass</h2>
            <div className={styles.card}>
              <div className={styles.boarding}>
                <div>
                  <h3 className={styles.boardingTitle}>Digital Boarding Pass</h3>
                  <p className={styles.muted}>Available once check-in is complete. Scan the QR code at the gate.</p>
                  <div className={styles.boardingActions}>
                    <FeatureAction label="Download boarding pass" reason={CHECK_IN_DISABLED} className={controls.primary} />
                    <FeatureAction label="Add to wallet" reason={CHECK_IN_DISABLED} className={controls.primary} />
                  </div>
                </div>
                <div className={styles.qrPlaceholder} aria-hidden="true" />
              </div>
            </div>
          </section>

          <div className={styles.columns}>
            <section>
              <h2 className={styles.sectionTitle}>Passengers</h2>
              <PassengersCard booking={booking} />
            </section>

            <section>
              <h2 className={styles.sectionTitle}>Meals &amp; Onboard Shop</h2>
              <div className={styles.card}>
                <p className={styles.text}>Add meals, snacks and duty-free to this booking.</p>
                <FeatureAction label="Browse onboard shop" reason={MEALS_DISABLED} className={controls.primary} />
                <div className={styles.mealButtons}>
                  <FeatureAction label="Pre-order meals" reason={MEALS_DISABLED} className={controls.secondary} />
                  <FeatureAction label="Snacks and drinks" reason={MEALS_DISABLED} className={controls.secondary} />
                  <FeatureAction label="Duty-free" reason={MEALS_DISABLED} className={controls.secondary} />
                </div>
                <p className={ordering.open ? styles.orderingOpen : styles.orderingClosed}>{orderingLabel(ordering)}</p>
              </div>
            </section>
          </div>

          <PaymentCard booking={booking} />

          <div className={styles.bottomCards}>
            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                Lost or delayed baggage? <span className={styles.featureChip}>F10</span>
              </h3>
              <p className={styles.muted}>Report a lost bag or follow a bag case for this booking.</p>
              <div className={styles.cardActions}>
                <FeatureAction label="Report a lost bag →" reason={LOST_BAG_DISABLED} className={controls.link} />
              </div>
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>
                Something went wrong? <span className={styles.featureChip}>F13</span>
              </h3>
              <p className={styles.muted}>Tell us about the flight, the food or a staff member.</p>
              <div className={styles.cardActions}>
                <FeatureAction label="Report a problem →" reason={COMPLAINT_DISABLED} className={controls.link} />
              </div>
            </section>
          </div>
        </div>
      </main>

      {isCancelOpen ? <CancelBookingDialog booking={booking} onClose={() => setIsCancelOpen(false)} onCancelled={handleCancelled} /> : null}
    </>
  )
}

/** What the cancel overlay says after the booking is cancelled. */
function cancelNotice(result: CancelBookingResult): string {
  if (result.refund > 0) {
    return `Booking cancelled. A refund of ${formatMoney(result.refund, result.currency)} goes back to your card through refunds (feature 5b).`
  }
  return 'Booking cancelled. Nothing was charged.'
}

function LoadingState() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.messageCard} aria-busy="true">
          <h1>Loading booking…</h1>
          <p className={styles.muted}>Checking your itinerary, your seats and your tickets.</p>
        </section>
      </div>
    </main>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.messageCard}>
          <h1>We couldn&apos;t find booking {reference}</h1>
          <p className={styles.muted}>Check the reference or go back to your trips.</p>
          <div className={styles.messageActions}>
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

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.messageCard}>
          <ApiErrorBanner error={error} />
          <div className={styles.messageActions}>
            <button type="button" className={controls.secondary} onClick={onRetry}>
              Try again
            </button>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
