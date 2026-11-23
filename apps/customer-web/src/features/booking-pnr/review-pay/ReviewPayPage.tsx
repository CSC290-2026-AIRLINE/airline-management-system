import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useBookingPnrApi, type ApiError } from '../api/client'
import type { BookingDetail, BookingServiceRequest, InsuranceOffer, InsurancePolicySummary } from '../api/types'
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
import controls from '../styles/controls'
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
  // The policy the confirm answered with, so the confirmation can show it right after paying.
  const [insurancePolicy, setInsurancePolicy] = useState<InsurancePolicySummary | null>(null)

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
    return <ConfirmedState booking={booking} insurancePolicy={insurancePolicy} />
  }
  if (booking.status === 'expired' || booking.status === 'cancelled') {
    return <LoadingState />
  }

  return <HeldReview booking={booking} onReload={reload} step={step} onInsurancePolicy={setInsurancePolicy} />
}

function HeldReview({
  booking,
  onReload,
  step,
  onInsurancePolicy,
}: {
  booking: BookingDetail
  onReload: () => Promise<void>
  step: BookingStep
  onInsurancePolicy: (policy: InsurancePolicySummary | null) => void
}) {
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
  const [insuranceOffer, setInsuranceOffer] = useState<InsuranceOffer>({ kind: 'none' })
  const [addInsurance, setAddInsurance] = useState(false)

  const countdownPaused = isConfirming || isCancelling || cancelOpen || confirmError !== null || cancelError !== null

  const seatCount = heldSeatCount(booking)
  const seatLabel = seatCount > 0 ? `${seatCount} held seat${seatCount === 1 ? '' : 's'}` : 'held seats'
  const copy = STEP_COPY[step]
  // Step 4 is the review & pay itself, the page the customer pays on. The other steps show one part of the booking.
  const isPayStep = step === 4

  /* Feature 11's travel insurance offer for the booker's tier. Without it the page simply shows no insurance. */
  useEffect(() => {
    let cancelled = false
    api
      .getInsuranceOffer(booking.reference)
      .then((offer) => {
        if (!cancelled) setInsuranceOffer(offer)
      })
      .catch(() => {
        if (!cancelled) setInsuranceOffer({ kind: 'none' })
      })
    return () => {
      cancelled = true
    }
    // The offer depends only on the booking; the api object is recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.reference])
  const insuranceAddOn = insuranceOffer.kind === 'member_price' && addInsurance ? insuranceOffer : null

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
      const result = await api.devConfirmBooking(booking.reference, { addInsurance: insuranceAddOn !== null })
      onInsurancePolicy(result.insurancePolicy ?? null)
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
  async function handleSaveContact(contact: { contactEmail: string; contactPhone?: string }) {
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
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-left md:py-10">
        <div className="space-y-6">
          <header className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight">
              <h1>Review &amp; pay</h1>
              <span className="rounded-md border bg-background px-2 py-0.5 font-mono text-xs text-muted-foreground">
                Booking {booking.reference}
              </span>
            </div>
            <p className="text-base text-muted-foreground">{copy.subtitle}</p>
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

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-6">
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

            <aside className="space-y-4 lg:sticky lg:top-16">
              <PriceCard booking={booking} insuranceAddOn={insuranceAddOn} />
              {isPayStep ? <ExtrasNote /> : null}
              {isPayStep ? (
                <InsuranceCard offer={insuranceOffer} checked={addInsurance} onChange={setAddInsurance} disabled={isConfirming} />
              ) : null}

              <div className="flex flex-col gap-2 [&>*]:w-full">
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

              {isPayStep && !import.meta.env.DEV ? (
                <p className="text-xs text-muted-foreground">Pay now will open checkout when it is connected.</p>
              ) : null}
              <p className="text-xs text-muted-foreground">{copy.note}</p>
              {isPayStep ? (
                <p className="text-xs text-muted-foreground">Want a meal on board? You can add meals from your booking once it is paid.</p>
              ) : null}
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Flights</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={controls.action} onClick={onChangeFlights}>
            Change flights
          </button>
          {onEdit ? (
            <button type="button" className={controls.action} onClick={onEdit}>
              Back to flights
            </button>
          ) : null}
        </div>
      </div>
      {booking.segments.map((segment) => {
        const seats = seatsBySegment.get(segment.bookingSegmentId) ?? []
        return (
          <div className="flex flex-wrap items-start justify-between gap-2" key={segment.bookingSegmentId}>
            <div>
              <p className="text-sm font-medium">
                {segment.flightNumber} · {formatDate(segment.depAt, segment.originTimeZone)} · {formatCabin(segment.cabin)}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {segment.origin} {formatTime(segment.depAt, segment.originTimeZone)} → {segment.destination}{' '}
                {formatTime(segment.arrAt, segment.destinationTimeZone)} · direct
              </p>
            </div>
            <div className="text-sm text-muted-foreground">{seats.length > 0 ? `Seats ${seats.join(', ')}` : 'Seats: choose later'}</div>
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
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Passengers</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={controls.action} onClick={onEditDetails}>
            Edit details
          </button>
          {onEdit ? (
            <button type="button" className={controls.action} onClick={onEdit}>
              Back to passengers
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
          <div
            className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
            key={passenger.bookingPassengerId}
          >
            <div>
              <p className="text-sm font-medium">
                {passenger.firstName} {passenger.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{passengerDetail}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {requests.length === 0 ? (
                <span className="text-sm text-muted-foreground">no extras</span>
              ) : (
                requests.map((request) => (
                  <span
                    className="inline-flex items-center rounded-md border border-warn/25 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn"
                    key={request.serviceRequestId}
                    title={request.decisionNote ?? undefined}
                  >
                    {request.serviceCode} {request.status}
                    {request.status === 'requested' ? ' · staff will review' : ''}
                  </span>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={controls.link} onClick={() => onRequestAssistance(passenger.bookingPassengerId)}>
                Request assistance
              </button>
            </div>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div>
          <p className="text-sm text-muted-foreground">Contact for this booking</p>
          <p className="text-sm">
            {booking.contactEmail}
            {booking.contactPhone ? ` · ${booking.contactPhone}` : ''}
          </p>
        </div>
        <button type="button" className={controls.action} onClick={onEditContact}>
          Change contact details
        </button>
      </div>
    </section>
  )
}

/** Onboard meals and shop products (feature 12) are optional. They are ordered once the booking is confirmed. */
function ExtrasNote() {
  return (
    <section
      className="flex flex-col gap-2 rounded-xl border bg-card p-6 text-card-foreground shadow-sm [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold"
      aria-labelledby="rp-extras-title"
    >
      <h2 id="rp-extras-title">Meals &amp; extras (optional)</h2>
      <p className="m-0 text-sm text-muted-foreground">
        After you pay, you can add meals, snacks and duty-free to this booking. Ordering stays open until 48 hours before departure.
      </p>
    </section>
  )
}

/**
 * Travel insurance, a loyalty tier benefit (feature 11): included for some tiers, an add-on at the member price for
 * others, and absent otherwise. The policy is issued when the booking is confirmed.
 */
function InsuranceCard({
  offer,
  checked,
  onChange,
  disabled,
}: {
  offer: InsuranceOffer
  checked: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
}) {
  if (offer.kind === 'none') {
    return null
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold"
      aria-labelledby="rp-insurance-title"
    >
      <h2 id="rp-insurance-title">Travel insurance</h2>
      {offer.kind === 'included' ? (
        <p className="text-sm">Included with your {offer.tierName} membership. The policy is issued when you pay.</p>
      ) : (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm [&_input]:mt-0.5 [&_input]:size-4 [&_input]:accent-primary [&_small]:block">
          <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
          <span>
            Add travel insurance for {formatMoney(offer.price, offer.currency)}
            <small className="text-xs text-muted-foreground">{offer.tierName} member price, covering everyone on this booking.</small>
          </span>
        </label>
      )}
    </section>
  )
}

function PriceCard({ booking, insuranceAddOn }: { booking: BookingDetail; insuranceAddOn: { price: number; currency: string } | null }) {
  const totals = new Map<string, number>()
  for (const coupon of booking.coupons) {
    totals.set(coupon.bookingPassengerId, (totals.get(coupon.bookingPassengerId) ?? 0) + coupon.priceTotal)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground shadow-sm [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <h2>Price</h2>
      {booking.passengers.map((passenger) => (
        <div className="flex justify-between gap-3 text-sm [&>span:last-child]:tabular-nums" key={passenger.bookingPassengerId}>
          <span>
            {passenger.firstName} · {passenger.passengerType}
          </span>
          <span>{formatMoney(totals.get(passenger.bookingPassengerId) ?? 0, booking.currency)}</span>
        </div>
      ))}
      {insuranceAddOn ? (
        <div className="flex justify-between gap-3 text-sm [&>span:last-child]:tabular-nums">
          <span>Travel insurance</span>
          <span>{formatMoney(insuranceAddOn.price, insuranceAddOn.currency)}</span>
        </div>
      ) : null}
      <div className="flex justify-between gap-3 border-t pt-3 text-base font-semibold tabular-nums">
        <span>Total</span>
        <span>{formatMoney(booking.total + (insuranceAddOn?.price ?? 0), booking.currency)}</span>
      </div>
      <p className="text-xs text-muted-foreground">Fares are quoted by pricing and fixed for this hold. Payment is taken at checkout.</p>
    </section>
  )
}

function LoadingState() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-left md:py-10">
      <div
        className="space-y-3 rounded-xl border bg-card p-6 text-left shadow-xs [&_h1]:m-0 [&_h1]:text-lg [&_h1]:font-semibold"
        aria-busy="true"
      >
        <h1>Loading booking…</h1>
        <p className="text-sm text-muted-foreground">Checking your hold.</p>
      </div>
    </main>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-left md:py-10">
      <div className="space-y-3 rounded-xl border bg-card p-6 text-left shadow-xs [&_h1]:m-0 [&_h1]:text-lg [&_h1]:font-semibold">
        <h1>We couldn&apos;t find booking {reference}</h1>
        <p className="text-sm text-muted-foreground">Check the reference or go back to your trips.</p>
        <div className="flex flex-wrap gap-2">
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
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-left md:py-10">
      <div className="space-y-3 rounded-xl border bg-card p-6 text-left shadow-xs [&_h1]:m-0 [&_h1]:text-lg [&_h1]:font-semibold">
        <ApiErrorBanner error={error} />
        <div className="flex flex-wrap gap-2">
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
