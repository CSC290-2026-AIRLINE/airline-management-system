import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { BookingDetail } from '../api/types'
import { FeatureAction } from '../booking-detail/FeatureAction'
import { MEALS_DISABLED, partyLabel } from '../booking-detail/booking-detail-model'
import { StatusChip } from '../components/StatusChip'
import { formatCabin, formatDateTime, formatFlightDate, formatMoney, formatTime } from '../lib/format'
import controls from '../styles/controls.module.css'
import styles from './ConfirmedState.module.css'
import '../styles/tokens.css'

/**
 * The booking is paid and ticketed.
 *
 * The page says what was booked, not only that it was: the reference the customer reads out to the airline, the flights
 * with their seats, who is travelling and what was paid. The trips and the passengers come from the booking itself, so
 * the page is the same whether the customer confirms here or arrives on a booking that was already paid.
 */
export function ConfirmedState({ booking }: { booking: BookingDetail }) {
  const passengersById = new Map(booking.passengers.map((passenger) => [passenger.bookingPassengerId, passenger]))
  /* The seats of every flight, so each flight row can say who sits where. */
  const seatsBySegment = new Map<string, string[]>()
  for (const coupon of booking.coupons) {
    if (!coupon.seatCode) {
      continue
    }
    const passenger = passengersById.get(coupon.bookingPassengerId)
    if (!passenger) {
      continue
    }
    const seats = seatsBySegment.get(coupon.bookingSegmentId) ?? []
    seats.push(`${coupon.seatCode} (${passenger.firstName})`)
    seatsBySegment.set(coupon.bookingSegmentId, seats)
  }

  const segments = [...booking.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.hero}>
          <span className={styles.successMark} aria-hidden="true">
            <Check size={26} strokeWidth={2.75} />
          </span>
          <div className={styles.heroText}>
            <StatusChip label="Confirmed" tone="confirmed" />
            <h1>Your booking is confirmed</h1>
            <p className={styles.lead}>Payment received and tickets issued.</p>
            <p className={styles.meta}>
              {booking.confirmedAt ? `Confirmed ${formatDateTime(booking.confirmedAt)}. ` : ''}A confirmation was sent to{' '}
              {booking.contactEmail}.
            </p>
          </div>
        </header>

        <div className={styles.reference}>
          <span className={styles.referenceLabel}>Booking reference</span>
          <span className={styles.referenceValue}>{booking.reference}</span>
        </div>

        <section aria-labelledby="confirmed-trip">
          <h2 id="confirmed-trip" className={styles.sectionTitle}>
            Your trip
          </h2>
          {segments.map((segment) => {
            const seats = seatsBySegment.get(segment.bookingSegmentId) ?? []
            return (
              <div className={styles.flightRow} key={segment.bookingSegmentId}>
                <div>
                  <p className={styles.flightNumber}>
                    {segment.flightNumber} · {formatCabin(segment.cabin)}
                  </p>
                  <p className={styles.flightRoute}>
                    {formatFlightDate(segment.depAt)} · {segment.origin} {formatTime(segment.depAt)} → {segment.destination}{' '}
                    {formatTime(segment.arrAt)}
                  </p>
                </div>
                <p className={styles.flightSeats}>
                  {seats.length === 0 ? 'Seat not chosen' : `${seats.length === 1 ? 'Seat' : 'Seats'} ${seats.join(', ')}`}
                </p>
              </div>
            )
          })}
        </section>

        <div className={styles.totalRow}>
          <p className={styles.party}>{partyLabel(booking.passengers)} · tickets issued</p>
          <p className={styles.total}>
            Total paid <strong>{formatMoney(booking.total, booking.currency)}</strong>
          </p>
        </div>

        <div className={styles.actions}>
          <Link to="/bookings/$reference" params={{ reference: booking.reference }} className={controls.primary}>
            View trip
          </Link>
          <FeatureAction label="Add meals" reason={MEALS_DISABLED} className={controls.secondary} />
        </div>
        <p className={styles.note}>Meals can be added from your booking once onboard ordering is available.</p>
      </section>
    </main>
  )
}
