import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useBookingPnrApi, type ApiError } from '../api/client'
import type { BookingDetail, BookingServiceRequest } from '../api/types'
import { useBooking } from '../api/useBooking'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { BookingRouteBar, type BookingStep } from '../components/BookingRouteBar'
import { HoldBanner } from '../components/HoldBanner'
import { BookingSeatChangesPanel } from '../seats/BookingSeatChangesPanel'
import { heldSeatCount } from '../lib/booking'
import { toApiError } from '../lib/errors'
import { formatCabin, formatDate, formatMoney, formatTime } from '../lib/format'
import { CancelHoldDialog } from './CancelHoldDialog'
import { ConfirmedState } from './ConfirmedState'
import styles from './ReviewPayPage.module.css'
import controls from '../styles/controls.module.css'
import '../styles/tokens.css'

/** The steps of the booking, the same ones the route bar shows. */
const STEPS: BookingStep[] = [1, 2, 3, 4]

/** What the page says on each step of the held booking. */
const STEP_COPY: Record<BookingStep, { subtitle: string; note: string }> = {
  1: {
    subtitle: 'The flights of this booking.',
    note: 'The flights are fixed for this booking. Your hold keeps running.',
  },
  2: {
    subtitle: 'The passengers of this booking.',
    note: 'The passenger details are fixed for this booking. Your hold keeps running.',
  },
  3: {
    subtitle: 'The seats of this booking.',
    note: 'You can change your seat while the hold runs. Your hold keeps running.',
  },
  4: {
    subtitle: 'Check your itinerary and passengers before paying.',
    note: 'You can change your seat while the hold runs. Your hold keeps running.',
  },
}

export function ReviewPayPage({ reference, step }: { reference: string; step: BookingStep }) {
  const navigate = useNavigate()
  const { booking, error, isLoading, reload } = useBooking(reference)

  useEffect(() => {
    if (!booking) {
      return
    }
    if (booking.status === 'expired' || booking.status === 'cancelled') {
      void navigate({
        to: '/hold-expired/$reference',
        params: { reference },
        search: { reason: booking.status },
        replace: true,
      })
    }
  }, [booking, navigate, reference])

  if (isLoading && !booking) {
    return <LoadingState />
  }
  if (error) {
    return error.status === 404 ? <NotFoundState reference={reference} /> : <ErrorState error={error} onRetry={() => void reload()} />
  }
  if (!booking) {
    return <NotFoundState reference={reference} />
  }
  if (booking.status === 'confirmed') {
    return <ConfirmedState booking={booking} />
  }
  if (booking.status === 'expired' || booking.status === 'cancelled') {
    return <LoadingState />
  }

  return <HeldReview booking={booking} onReload={reload} step={step} />
}

function HeldReview({ booking, onReload, step }: { booking: BookingDetail; onReload: () => Promise<void>; step: BookingStep }) {
  const navigate = useNavigate()
  const api = useBookingPnrApi()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [confirmError, setConfirmError] = useState<ApiError | null>(null)
  const [cancelError, setCancelError] = useState<ApiError | null>(null)

  const countdownPaused = isConfirming || isCancelling || cancelOpen || confirmError !== null || cancelError !== null

  const seatCount = heldSeatCount(booking)
  const seatLabel = seatCount > 0 ? `${seatCount} held seat${seatCount === 1 ? '' : 's'}` : 'held seats'
  const copy = STEP_COPY[step]
  // Step 4 is the review & pay itself, the page the customer pays on. The other steps show one part of the booking.
  const isPayStep = step === 4

  async function handleConfirm() {
    setIsConfirming(true)
    setConfirmError(null)

    try {
      await api.devConfirmBooking(booking.reference)
      await onReload()
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.code === 'HOLD_EXPIRED_REFUNDED') {
        void navigate({
          to: '/hold-expired/$reference',
          params: { reference: booking.reference },
          search: { reason: 'refunded' },
          replace: true,
        })
        return
      }
      if (apiError.code === 'INVALID_BOOKING_STATE') {
        await onReload()
        return
      }
      setConfirmError(apiError)
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleCancel() {
    setIsCancelling(true)
    setCancelError(null)

    try {
      await api.cancelBooking(booking.reference)
      void navigate({
        to: '/hold-expired/$reference',
        params: { reference: booking.reference },
        search: { reason: 'cancelled' },
        replace: true,
      })
    } catch (error) {
      const apiError = toApiError(error)
      if (apiError.code === 'INVALID_BOOKING_STATE') {
        await onReload()
        return
      }
      setCancelError(apiError)
    } finally {
      setIsCancelling(false)
    }
  }

  // The pay action belongs to the review & pay step. The other steps send the customer back to it.
  const payAction = import.meta.env.DEV ? (
    <button type="button" className={controls.primary} onClick={() => void handleConfirm()} disabled={isConfirming || isCancelling}>
      {isConfirming ? 'Confirming…' : 'Confirm booking (dev)'}
    </button>
  ) : (
    <button type="button" className={controls.primary} disabled title="Checkout (feature 5a) is not connected yet.">
      Pay now
    </button>
  )

  return (
    <>
      <main className={styles.page}>
        <div className={styles.shell}>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Booking {booking.reference}</p>
            <h1>Review &amp; pay</h1>
            <p className={styles.subtitle}>{copy.subtitle}</p>
          </header>

          {/* The bar takes the customer back to a step of this booking. Every step but the one they are on can be
              opened, so they can walk back and forth while the hold runs. */}
          <BookingRouteBar
            currentStep={step}
            clickableSteps={STEPS.filter((item) => item !== step)}
            onStepClick={(next) => {
              void navigate({
                to: '/review-pay/$reference',
                params: { reference: booking.reference },
                search: { step: next },
              })
            }}
          />
          <HoldBanner
            reference={booking.reference}
            holdExpiresAt={booking.holdExpiresAt}
            serverNow={booking.serverNow}
            paused={countdownPaused}
            onExpire={() => {
              void navigate({
                to: '/hold-expired/$reference',
                params: { reference: booking.reference },
                search: { reason: 'expired' },
                replace: true,
              })
            }}
          />

          {confirmError ? <ApiErrorBanner error={confirmError} /> : null}

          <div className={styles.columns}>
            <div className={styles.mainColumn}>
              {step === 1 || isPayStep ? <FlightsCard booking={booking} /> : null}
              {step === 2 || isPayStep ? <PassengersCard booking={booking} /> : null}
              {/* The seat of a held booking can still be changed, so the panel works on a hold too. */}
              {step === 3 || isPayStep ? <BookingSeatChangesPanel reference={booking.reference} onChanged={() => void onReload()} /> : null}
            </div>

            <aside className={styles.summaryColumn}>
              <PriceCard booking={booking} />

              <div className={styles.actions}>
                {isPayStep ? (
                  payAction
                ) : (
                  <Link
                    to="/review-pay/$reference"
                    params={{ reference: booking.reference }}
                    search={{ step: 4 }}
                    className={controls.primary}
                  >
                    Back to review &amp; pay
                  </Link>
                )}
                <Link to="/search" className={controls.secondary}>
                  Search again
                </Link>
                {isPayStep ? (
                  <button
                    type="button"
                    className={controls.secondary}
                    onClick={() => {
                      setCancelError(null)
                      setCancelOpen(true)
                    }}
                    disabled={isConfirming || isCancelling}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>

              {isPayStep && !import.meta.env.DEV ? <p className={styles.note}>Pay now will open checkout when it is connected.</p> : null}
              <p className={styles.note}>{copy.note}</p>
              {isPayStep ? <p className={styles.note}>Want a meal on board? You can add meals from your booking once it is paid.</p> : null}
            </aside>
          </div>
        </div>
      </main>

      <CancelHoldDialog
        open={cancelOpen}
        reference={booking.reference}
        seatLabel={seatLabel}
        isCancelling={isCancelling}
        error={cancelError}
        onKeep={() => {
          setCancelOpen(false)
          setCancelError(null)
        }}
        onConfirm={() => void handleCancel()}
      />
    </>
  )
}

function FlightsCard({ booking }: { booking: BookingDetail }) {
  const passengerById = new Map(booking.passengers.map((passenger) => [passenger.bookingPassengerId, passenger]))
  const seatsBySegment = new Map<string, string[]>()

  for (const coupon of booking.coupons) {
    if (!coupon.seatCode) {
      continue
    }
    const passenger = passengerById.get(coupon.bookingPassengerId)
    if (!passenger) {
      continue
    }
    const seats = seatsBySegment.get(coupon.bookingSegmentId) ?? []
    seats.push(`${coupon.seatCode} (${passenger.firstName})`)
    seatsBySegment.set(coupon.bookingSegmentId, seats)
  }

  return (
    <section className={styles.card}>
      <h2>Flights</h2>
      {booking.segments.map((segment) => {
        const seats = seatsBySegment.get(segment.bookingSegmentId) ?? []
        return (
          <div className={styles.flightRow} key={segment.bookingSegmentId}>
            <div>
              <p className={styles.flightNumber}>
                {segment.flightNumber} · {formatDate(segment.depAt)} · {formatCabin(segment.cabin)}
              </p>
              <p className={styles.flightRoute}>
                {segment.origin} {formatTime(segment.depAt)} → {segment.destination} {formatTime(segment.arrAt)} · direct
              </p>
            </div>
            <div className={styles.flightSeats}>{seats.length > 0 ? `Seats ${seats.join(', ')}` : 'Seats: choose later'}</div>
          </div>
        )
      })}
    </section>
  )
}

function PassengersCard({ booking }: { booking: BookingDetail }) {
  const requestsByPassenger = new Map<string, BookingServiceRequest[]>()
  for (const request of booking.serviceRequests) {
    const requests = requestsByPassenger.get(request.bookingPassengerId) ?? []
    requests.push(request)
    requestsByPassenger.set(request.bookingPassengerId, requests)
  }

  return (
    <section className={styles.card}>
      <h2>Passengers</h2>
      {booking.passengers.map((passenger) => {
        const requests = requestsByPassenger.get(passenger.bookingPassengerId) ?? []
        const lapAdult = passenger.lapOfBookingPassengerId
          ? booking.passengers.find((adult) => adult.bookingPassengerId === passenger.lapOfBookingPassengerId)
          : undefined
        const passengerDetail =
          passenger.passengerType === 'infant' && lapAdult ? `infant · on ${lapAdult.firstName}'s lap` : passenger.passengerType

        return (
          <div className={styles.passengerRow} key={passenger.bookingPassengerId}>
            <div>
              <p className={styles.passengerName}>
                {passenger.firstName} {passenger.lastName}
              </p>
              <p className={styles.muted}>{passengerDetail}</p>
            </div>
            <div className={styles.chips}>
              {requests.length === 0 ? (
                <span className={styles.muted}>no extras</span>
              ) : (
                requests.map((request) => (
                  <span className={styles.warningChip} key={request.serviceRequestId} title={request.decisionNote ?? undefined}>
                    {request.serviceCode} {request.status}
                    {request.status === 'requested' ? ' · staff will review' : ''}
                  </span>
                ))
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function PriceCard({ booking }: { booking: BookingDetail }) {
  const totals = new Map<string, number>()
  for (const coupon of booking.coupons) {
    totals.set(coupon.bookingPassengerId, (totals.get(coupon.bookingPassengerId) ?? 0) + coupon.priceTotal)
  }

  return (
    <section className={styles.card}>
      <h2>Price</h2>
      {booking.passengers.map((passenger) => (
        <div className={styles.priceRow} key={passenger.bookingPassengerId}>
          <span>
            {passenger.firstName} · {passenger.passengerType}
          </span>
          <span>{formatMoney(totals.get(passenger.bookingPassengerId) ?? 0, booking.currency)}</span>
        </div>
      ))}
      <div className={styles.totalRow}>
        <span>Total</span>
        <span>{formatMoney(booking.total, booking.currency)}</span>
      </div>
      <p className={styles.note}>Fares are quoted by pricing and fixed for this hold. Payment is taken at checkout.</p>
    </section>
  )
}

function LoadingState() {
  return (
    <main className={styles.page}>
      <div className={styles.messageCard} aria-busy="true">
        <h1>Loading booking…</h1>
        <p className={styles.muted}>Checking your hold.</p>
      </div>
    </main>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.messageCard}>
        <h1>We couldn&apos;t find booking {reference}</h1>
        <p className={styles.muted}>Check the reference or go back to your trips.</p>
        <div className={styles.confirmedActions}>
          <Link to="/bookings" className={controls.primary}>
            Go to My Trips
          </Link>
          <Link to="/search" className={controls.secondary}>
            Search flights
          </Link>
        </div>
      </div>
    </main>
  )
}

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <main className={styles.page}>
      <div className={styles.messageCard}>
        <ApiErrorBanner error={error} />
        <div className={styles.confirmedActions}>
          <button type="button" className={controls.secondary} onClick={onRetry}>
            Try again
          </button>
          <Link to="/bookings" className={controls.secondary}>
            Go to My Trips
          </Link>
        </div>
      </div>
    </main>
  )
}
