import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useBookingPnrApi, type ApiError } from '../api/client'
import type { BookingDetail, BookingServiceRequest } from '../api/types'
import { useBooking } from '../api/useBooking'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { BookingRouteBar, type BookingStep } from '../components/BookingRouteBar'
import { HoldBanner } from '../components/HoldBanner'
import { BookingSeatChangesPanel } from '../seats/BookingSeatChangesPanel'
import { AssistanceRequestDialog } from '../assistance/AssistanceRequestDialog'
import type { AssistanceValue } from '../components/contracts'
import { heldSeatCount } from '../lib/booking'
import { toApiError } from '../lib/errors'
import { formatCabin, formatDate, formatMoney, formatTime } from '../lib/format'
import { CancelHoldDialog } from './CancelHoldDialog'
import { ChangeFlightsDialog } from './ChangeFlightsDialog'
import { ConfirmedState } from './ConfirmedState'
import { EditContactDialog } from './EditContactDialog'
import { EditPassengersDialog } from './EditPassengersDialog'
import { searchParamsForBooking } from './search-params-for-booking'
import styles from './ReviewPayPage.module.css'
import controls from '../styles/controls.module.css'
import '../styles/tokens.css'

/** The steps of the booking, the same ones the route bar shows. */
const STEPS: BookingStep[] = [1, 2, 3, 4]

/** What the page says on each step of the held booking. */
const STEP_COPY: Record<BookingStep, { subtitle: string; note: string }> = {
  1: {
    subtitle: 'The flights of this booking.',
    note: 'Changing your flights releases this hold and takes you back to the search.',
  },
  2: {
    subtitle: 'The passengers of this booking.',
    note: 'You can change the contact details and add assistance while the hold runs.',
  },
  3: {
    subtitle: 'The seats of this booking.',
    note: 'You can change your seat while the hold runs. Your hold keeps running.',
  },
  4: {
    subtitle: 'Check your itinerary and passengers before paying.',
    note: 'You can go back to your flights, passengers and seats before you pay. Your hold keeps running.',
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
  const [contactOpen, setContactOpen] = useState(false)
  const [flightsOpen, setFlightsOpen] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState<ApiError | null>(null)
  const [assistancePassengerId, setAssistancePassengerId] = useState<string | null>(null)
  const [passengersOpen, setPassengersOpen] = useState(false)

  const countdownPaused = isConfirming || isCancelling || cancelOpen || confirmError !== null || cancelError !== null

  const seatCount = heldSeatCount(booking)
  const seatLabel = seatCount > 0 ? `${seatCount} held seat${seatCount === 1 ? '' : 's'}` : 'held seats'
  const copy = STEP_COPY[step]
  // Step 4 is the review & pay itself, the page the customer pays on. The other steps show one part of the booking.
  const isPayStep = step === 4

  /** Opens another step of this booking, so the customer can walk back and forth while the hold runs. */
  function goToStep(next: BookingStep) {
    void navigate({
      to: '/review-pay/$reference',
      params: { reference: booking.reference },
      search: { step: next },
    })
  }

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

  /** The contact details of a held booking can be changed in place: the price does not move. */
  async function handleSaveContact(contact: { contactEmail: string; contactPhone: string }) {
    await api.updateContact(booking.reference, contact)
    await onReload()
  }

  /** The flights of a held booking cannot be swapped, so changing them releases the hold and starts a new search. */
  async function handleChangeFlights() {
    setIsReleasing(true)
    setReleaseError(null)
    try {
      await api.cancelBooking(booking.reference)
      void navigate({ to: '/search', search: searchParamsForBooking(booking) })
    } catch (error) {
      setReleaseError(toApiError(error))
    } finally {
      setIsReleasing(false)
    }
  }

  /** The pay action belongs to the review & pay step. The other steps send the customer back to it. */
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
            onStepClick={(next) => goToStep(next)}
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
              {step === 1 || isPayStep ? (
                <FlightsCard
                  booking={booking}
                  onEdit={isPayStep ? () => goToStep(1) : undefined}
                  onChangeFlights={() => setFlightsOpen(true)}
                />
              ) : null}
              {step === 2 || isPayStep ? (
                <PassengersCard
                  booking={booking}
                  onEdit={isPayStep ? () => goToStep(2) : undefined}
                  onEditContact={() => setContactOpen(true)}
                  onEditDetails={() => setPassengersOpen(true)}
                  onRequestAssistance={(passengerId) => setAssistancePassengerId(passengerId)}
                />
              ) : null}
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
                {isPayStep ? (
                  <button type="button" className={controls.secondary} onClick={() => goToStep(3)}>
                    Back to seats
                  </button>
                ) : null}
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

      {/* The dialogs are mounted while they are open, so they always start with the details the booking holds now. */}
      {contactOpen ? (
        <EditContactDialog
          open
          contactEmail={booking.contactEmail}
          contactPhone={booking.contactPhone}
          onClose={() => setContactOpen(false)}
          onSave={handleSaveContact}
        />
      ) : null}

      {flightsOpen ? (
        <ChangeFlightsDialog
          open
          reference={booking.reference}
          seatLabel={seatLabel}
          isReleasing={isReleasing}
          error={releaseError}
          onKeep={() => {
            setFlightsOpen(false)
            setReleaseError(null)
          }}
          onConfirm={() => void handleChangeFlights()}
        />
      ) : null}

      {passengersOpen ? (
        <EditPassengersDialog
          open
          booking={booking}
          onClose={() => setPassengersOpen(false)}
          onRebooked={(reference) => {
            void navigate({ to: '/review-pay/$reference', params: { reference } })
          }}
        />
      ) : null}

      <AssistanceRequestDialog
        open={assistancePassengerId !== null}
        onClose={() => setAssistancePassengerId(null)}
        passengerName={booking.passengers
          .filter((person) => person.bookingPassengerId === assistancePassengerId)
          .map((person) => `${person.firstName} ${person.lastName}`)
          .join('')}
        flightLabel="All flights"
        onSubmit={async (value: AssistanceValue) => {
          if (!assistancePassengerId || !value.serviceCode) return
          await api.createServiceRequest(booking.reference, {
            bookingPassengerId: assistancePassengerId,
            bookingSegmentId: null,
            serviceCode: value.serviceCode,
            note: value.note || null,
          })
          await onReload()
        }}
      />
    </>
  )
}

function FlightsCard({
  booking,
  onEdit,
  onChangeFlights,
}: {
  booking: BookingDetail
  /** Jumps back to the flights step. Only on the review & pay step, where the card is a summary of the other steps. */
  onEdit?: () => void
  onChangeFlights: () => void
}) {
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
      <div className={styles.cardHeader}>
        <h2>Flights</h2>
        <div className={styles.cardActions}>
          <button type="button" className={controls.link} onClick={onChangeFlights}>
            Change flights
          </button>
          {onEdit ? (
            <button type="button" className={controls.link} onClick={onEdit}>
              Edit
            </button>
          ) : null}
        </div>
      </div>
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

function PassengersCard({
  booking,
  onEdit,
  onEditContact,
  onEditDetails,
  onRequestAssistance,
}: {
  booking: BookingDetail
  /** Jumps back to the passengers step. Only on the review & pay step, where the card is a summary of the other steps. */
  onEdit?: () => void
  onEditContact: () => void
  onEditDetails: () => void
  onRequestAssistance: (passengerId: string) => void
}) {
  const requestsByPassenger = new Map<string, BookingServiceRequest[]>()
  for (const request of booking.serviceRequests) {
    const requests = requestsByPassenger.get(request.bookingPassengerId) ?? []
    requests.push(request)
    requestsByPassenger.set(request.bookingPassengerId, requests)
  }

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2>Passengers</h2>
        <div className={styles.cardActions}>
          <button type="button" className={controls.link} onClick={onEditDetails}>
            Edit details
          </button>
          {onEdit ? (
            <button type="button" className={controls.link} onClick={onEdit}>
              Edit
            </button>
          ) : null}
        </div>
      </div>
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
            <div className={styles.passengerActions}>
              <button type="button" className={controls.link} onClick={() => onRequestAssistance(passenger.bookingPassengerId)}>
                Request assistance
              </button>
            </div>
          </div>
        )
      })}
      <div className={styles.contactRow}>
        <div>
          <p className={styles.muted}>Contact for this booking</p>
          <p className={styles.contactDetails}>
            {booking.contactEmail}
            {booking.contactPhone ? ` · ${booking.contactPhone}` : ''}
          </p>
        </div>
        <button type="button" className={controls.link} onClick={onEditContact}>
          Change contact details
        </button>
      </div>
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
