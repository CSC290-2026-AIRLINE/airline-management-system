import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { FlightSearchPage, type SearchItinerary } from '@customer-web/features/booking-search/pages/FlightSearchPage'
import type { FlightSearchUrlState } from '@customer-web/features/booking-search/search-params'
import { PassengersPage } from '@customer-web/features/booking-pnr/passengers/PassengersPage'
import { travellersFor, validateTravellers, type BookingContact, type TravellerDraft } from '@customer-web/features/booking-pnr/flow/draft'
import { validateSeatChoices, type SeatChoice } from '@customer-web/features/booking-pnr/flow/integration'
import { resolveDemoPassengers } from '@customer-web/features/booking-pnr/passengers/demo-passengers'
import { ApiError, useBookingPnrApi } from '../api/client'
import type { BookForCustomerRequest, HoldBookingResponse } from '../api/types'
import { lookupMoney as money } from '../booking-lookup/lookup-utils'
import { useDemoStaffBooking } from './useDemoStaffBooking'
import { clearBookingDraft, readBookingDraft, saveBookingDraft, type StaffBookingStep } from './booking-draft'
import { STAFF_BOOKING_STAGES } from './booking-stages'
import { StaffBookingStepper } from './StaffBookingStepper'
import { StaffSeatStep } from './StaffSeatStep'
import '@customer-web/features/booking-pnr/flow/flow.css'
import './staff-booking.css'

/** The title and the line under it of each step of the staff flow. */
const STEP_COPY: Record<'passengers' | 'seats' | 'held', { title: string; intro: string }> = {
  passengers: {
    title: 'Passengers & extras',
    intro: 'Enter every traveller exactly as their passport shows. Nothing is held until you create the booking.',
  },
  seats: {
    title: 'Choose seats',
    intro: 'Pick a seat for each traveller, or hold the booking without any. The seats are held for 15 minutes with the booking.',
  },
  held: {
    title: 'Booking held',
    intro: 'The booking is held, not ticketed. Share the reference with your customer before the hold expires.',
  },
}

class StaffBookingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="f3-search">
        <h1>Staff booking is unavailable</h1>
        <p>Refresh the page to try again.</p>
        <button className="f3-search-primary" onClick={() => window.location.reload()}>
          Refresh page
        </button>
      </main>
    ) : (
      this.props.children
    )
  }
}
export function BookForCustomerPage() {
  return (
    <StaffBookingBoundary>
      <StaffBookingContent />
    </StaffBookingBoundary>
  )
}

function StaffBookingContent() {
  const data = useDemoStaffBooking()
  const { bookForCustomer } = useBookingPnrApi()
  const [restored] = useState(readBookingDraft)
  const [customerId, setCustomerId] = useState(restored?.customerId ?? '')
  const [step, setStep] = useState<StaffBookingStep>(restored?.step ?? 'search')
  const [searchState, setSearchState] = useState<FlightSearchUrlState | null>(restored?.search ?? null)
  const [itinerary, setItinerary] = useState<SearchItinerary | null>(restored?.itinerary ?? null)
  const [travellers, setTravellers] = useState<TravellerDraft[]>(restored?.travellers ?? [])
  const [contact, setContact] = useState<BookingContact>(restored?.contact ?? { email: '', phone: '', promoCode: '' })
  const [choices, setChoices] = useState<SeatChoice[]>(restored?.choices ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<HoldBookingResponse | null>(restored?.held ?? null)
  const [attempt, setAttempt] = useState<{ body: string; key: string } | null>(restored?.attempt ?? null)
  const inFlight = useRef(false)
  const customer = data.customers.find((row) => row.id === customerId)
  const customerMissing = !data.loading && !data.error && !!customerId && !customer
  const activeStep: StaffBookingStep = customerMissing && step !== 'held' ? 'search' : step
  const tripCurrency = held?.currency ?? itinerary?.selections[0]?.fare.currency ?? 'USD'
  /* The stepper starts at the passengers step, because the flights are already chosen when it appears. */
  const stageIndex = activeStep === 'search' ? 0 : activeStep === 'passengers' ? 1 : activeStep === 'seats' ? 2 : 3
  const stageCopy = STEP_COPY[activeStep === 'seats' ? 'seats' : activeStep === 'held' ? 'held' : 'passengers']

  /* Keeps the draft in this tab so a refresh comes back to the same step. */
  useEffect(() => {
    if (!customerId && !itinerary && !held && !searchState && step === 'search') {
      clearBookingDraft()
      return
    }
    saveBookingDraft({ version: 1, customerId, step, search: searchState, itinerary, travellers, contact, choices, held, attempt })
  }, [customerId, step, searchState, itinerary, travellers, contact, choices, held, attempt])

  function chooseCustomer(id: string) {
    const next = data.customers.find((row) => row.id === id)
    setCustomerId(id)
    setContact({ email: next?.email ?? '', phone: next?.phone ?? '', promoCode: '' })
    setTravellers([])
    setItinerary(null)
    setChoices([])
    setHeld(null)
    setError(null)
    setStep('search')
    setAttempt(null)
  }
  function startNewBooking() {
    setCustomerId('')
    setStep('search')
    setSearchState(null)
    setItinerary(null)
    setTravellers([])
    setContact({ email: '', phone: '', promoCode: '' })
    setChoices([])
    setHeld(null)
    setError(null)
    setAttempt(null)
    clearBookingDraft()
  }
  function chooseFlights(selection: SearchItinerary) {
    setItinerary(selection)
    setTravellers((current) => travellersFor(selection, current))
    setChoices([])
    setError(null)
    setStep('passengers')
  }
  function updateTraveller(key: string, change: Partial<TravellerDraft>) {
    setTravellers((current) => current.map((person) => (person.key === key ? { ...person, ...change } : person)))
    /* A changed traveller may need another seat, so the chosen seats are dropped. */
    setChoices([])
    setError(null)
  }
  function continueToSeats() {
    if (!itinerary) return
    const validation = validateTravellers(travellers, contact, itinerary)
    if (validation) {
      setError(validation.message)
      return
    }
    try {
      resolveDemoPassengers(travellers, data.profiles)
      setError(null)
      setStep('seats')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Choose a demo traveller for every passenger.')
    }
  }
  async function createHold(expectedTotal: number, selectedSeats: SeatChoice[]) {
    if (!customer || !itinerary || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const validation = validateTravellers(travellers, contact, itinerary)
      if (validation) throw new Error(validation.message)
      validateSeatChoices(selectedSeats, travellers, itinerary)
      const ids = resolveDemoPassengers(travellers, data.profiles)
      const idFor = (key: string) => ids.find((person) => person.key === key)!.passengerId
      const request: BookForCustomerRequest = {
        customerId: customer.id,
        tripType: itinerary.request.tripType,
        paymentType: 'cash',
        passengers: travellers.map((person) => ({
          passengerId: idFor(person.key),
          passengerType: person.expectedType,
          ...(person.expectedType === 'infant' ? { lapOfPassengerId: idFor(person.lapOfKey) } : {}),
        })),
        segments: itinerary.selections.map(({ flight, fare }) => ({
          flightId: flight.flightId,
          cabin: fare.cabin,
          fareClassId: fare.fareClassId,
          fareQuoteId: fare.fareQuoteId,
        })),
        contactEmail: contact.email.trim(),
        contactPhone: contact.phone.trim(),
        promoCode: contact.promoCode.trim() || undefined,
        expectedTotal,
        seats: selectedSeats.map((choice) => ({
          passengerId: idFor(choice.travellerKey),
          flightId: choice.flightId,
          seatCode: choice.seatCode,
        })),
      }
      const body = JSON.stringify(request)
      /* The same request keeps the same idempotency key, so a retry after a refresh is not a second booking. */
      const next = attempt && attempt.body === body ? attempt : { body, key: crypto.randomUUID() }
      setAttempt(next)
      saveBookingDraft({
        version: 1,
        customerId,
        step,
        search: searchState,
        itinerary,
        travellers,
        contact,
        choices: selectedSeats,
        held,
        attempt: next,
      })
      const booking = await bookForCustomer(request, next.key)
      setHeld(booking)
      setStep('held')
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'PRICE_CHANGED'
          ? 'The fare has changed. Return to flights and check the new price. No booking was held.'
          : cause instanceof ApiError && cause.code === 'SEAT_UNAVAILABLE'
            ? 'A chosen seat is no longer available. Pick another seat and try again. No booking was held.'
            : cause instanceof ApiError && cause.code === 'FARE_UNAVAILABLE'
              ? 'This fare is no longer available. Return to flights and choose another option. No booking was held.'
              : cause instanceof Error
                ? cause.message
                : 'We could not create the booking. Please try again.',
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <div className="f3-staff-booking">
      <section className="f3-search f3-staff-customer">
        <div className="f3-search-heading">
          <div>
            <p className="f3-search-eyebrow">STAFF BOOKING</p>
            <h1>Book for customer</h1>
          </div>
        </div>
        <p className="f3-search-intro">Select a customer, then choose flights and enter the booking details on their behalf.</p>
        {import.meta.env.DEV && (
          <div className="f3-demo-notice">
            <strong>Development demo booking</strong>
            <p>Only the seeded demo customer and travellers are available. Bookings use the real inventory hold.</p>
          </div>
        )}
        {data.error && (
          <p className="f3-flow-error" role="alert">
            {data.error}
          </p>
        )}
        {customerMissing && (
          <p className="f3-flow-error" role="alert">
            That customer is no longer available. Choose a customer again to continue.
          </p>
        )}
        <div className="f3-search-card f3-staff-customer-picker">
          <label>
            Customer
            <Select
              value={customerMissing ? '' : customerId}
              disabled={data.loading || !!data.error || busy || activeStep === 'held'}
              onValueChange={(value) => chooseCustomer(value)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder={data.loading ? 'Loading demo customers…' : 'Choose a demo customer'} />
              </SelectTrigger>
              <SelectContent>
                {data.customers.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name} · {row.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {customer && (
            <p>
              {customer.email} · {customer.phone}
            </p>
          )}
        </div>
      </section>
      {activeStep === 'search' && (
        <FlightSearchPage
          urlState={searchState ?? undefined}
          onUrlChange={setSearchState}
          initialItinerary={searchState ? undefined : (itinerary ?? undefined)}
          onContinue={customer && !data.error ? chooseFlights : undefined}
        />
      )}
      {activeStep !== 'search' && itinerary && (
        <main className="f3-search f3-flow f3-staff-flow">
          <header className="f3-staff-flow__header">
            <p className="f3-search-eyebrow">
              STEP {stageIndex + 1} OF {STAFF_BOOKING_STAGES.length} · {STAFF_BOOKING_STAGES[stageIndex]?.label}
            </p>
            <h1>{stageCopy.title}</h1>
            <p className="f3-staff-flow__intro">{stageCopy.intro}</p>
          </header>
          <StaffBookingStepper stages={STAFF_BOOKING_STAGES} current={stageIndex} />
          <div className={`f3-flow-columns${activeStep === 'seats' ? ' f3-flow-columns--seats' : ''}`}>
            <div>
              {activeStep === 'passengers' && (
                <PassengersPage
                  itinerary={itinerary}
                  travellers={travellers}
                  contact={contact}
                  onTravellerChange={updateTraveller}
                  onContactChange={setContact}
                  onBack={() => {
                    setError(null)
                    setStep('search')
                  }}
                  onContinue={continueToSeats}
                  error={error}
                  demoProfiles={data.profiles}
                  demoLoading={data.loading}
                  demoError={data.error}
                />
              )}
              {activeStep === 'seats' && (
                <StaffSeatStep
                  itinerary={itinerary}
                  currency={tripCurrency}
                  travellers={travellers}
                  choices={choices}
                  busy={busy}
                  error={error}
                  promoCode={contact.promoCode.trim() || undefined}
                  onChange={(next) => {
                    if (!inFlight.current) {
                      setChoices(next)
                      setError(null)
                    }
                  }}
                  onBack={() => {
                    setError(null)
                    setStep('passengers')
                  }}
                  onContinue={(expectedTotal) => void createHold(expectedTotal, choices)}
                  onSkip={(expectedTotal) => void createHold(expectedTotal, [])}
                />
              )}
              {activeStep === 'held' && held && (
                <section className="f3-passenger-card f3-staff-receipt">
                  <span className="f3-staff-held">Held · awaiting payment</span>
                  <p className="f3-staff-receipt__label">Booking reference</p>
                  <h2 className="f3-staff-receipt__reference">{held.reference}</h2>
                  <dl className="f3-staff-receipt__facts">
                    <div>
                      <dt>Customer</dt>
                      <dd>{customer ? customer.name : 'Selected customer'}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{money(held.total, held.currency)}</dd>
                    </div>
                    <div>
                      <dt>Hold expires</dt>
                      <dd>
                        {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(held.holdExpiresAt))}
                      </dd>
                    </div>
                  </dl>
                  <p className="f3-staff-receipt__note">
                    This booking is not confirmed. The hold ends when the timer runs out or the booking is cancelled.
                  </p>
                  <div className="f3-flow-actions">
                    <button className="f3-search-secondary" type="button" onClick={startNewBooking}>
                      Start a new booking
                    </button>
                    <Link className="f3-search-primary" to="/booking-lookup" search={{ reference: held.reference }}>
                      Open booking lookup
                    </Link>
                  </div>
                </section>
              )}
            </div>
            {activeStep !== 'seats' && (
              <aside className="f3-flow-summary" aria-label="Staff trip summary">
                <p className="f3-search-eyebrow">YOUR CUSTOMER’S TRIP</p>
                {itinerary.selections.map(({ flight, fare }) => (
                  <article key={flight.flightId}>
                    <strong>
                      {flight.origin} → {flight.destination}
                    </strong>
                    <p>
                      {flight.flightNumber} · {fare.cabin.replace('_', ' ')}
                    </p>
                    <p>
                      {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
                        new Date(flight.depAt),
                      )}
                    </p>
                  </article>
                ))}
                <strong>{money(itinerary.expectedTotal, tripCurrency)}</strong>
                <p>The hold lasts 15 minutes from booking creation.</p>
              </aside>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
