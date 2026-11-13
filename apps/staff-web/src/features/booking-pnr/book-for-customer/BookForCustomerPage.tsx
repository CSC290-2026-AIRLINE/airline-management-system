import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { FlightSearchPage, type SearchItinerary } from '../../../../../customer-web/src/features/booking-search/pages/FlightSearchPage'
import type { FlightSearchUrlState } from '../../../../../customer-web/src/features/booking-search/search-params'
import { PassengersPage } from '../../../../../customer-web/src/features/booking-pnr/passengers/PassengersPage'
import {
  travellersFor,
  validateTravellers,
  type BookingContact,
  type TravellerDraft,
} from '../../../../../customer-web/src/features/booking-pnr/flow/draft'
import { resolveDemoPassengers } from '../../../../../customer-web/src/features/booking-pnr/passengers/demo-passengers'
import { ApiError, useBookingPnrApi } from '../api/client'
import type { BookForCustomerRequest, HoldBookingResponse } from '../api/types'
import { lookupMoney as money } from '../booking-lookup/lookup-utils'
import { useDemoStaffBooking } from './useDemoStaffBooking'
import { clearBookingDraft, readBookingDraft, saveBookingDraft, type StaffBookingStep } from './booking-draft'
import '../../../../../customer-web/src/features/booking-pnr/flow/flow.css'
import './staff-booking.css'

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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<HoldBookingResponse | null>(restored?.held ?? null)
  const [attempt, setAttempt] = useState<{ body: string; key: string } | null>(restored?.attempt ?? null)
  const inFlight = useRef(false)
  const customer = data.customers.find((row) => row.id === customerId)
  const customerMissing = !data.loading && !data.error && !!customerId && !customer
  const activeStep: StaffBookingStep = customerMissing && step !== 'held' ? 'search' : step
  const tripCurrency = held?.currency ?? itinerary?.selections[0]?.fare.currency ?? 'USD'

  /* Keeps the draft in this tab so a refresh comes back to the same step. */
  useEffect(() => {
    if (!customerId && !itinerary && !held && !searchState && step === 'search') {
      clearBookingDraft()
      return
    }
    saveBookingDraft({ version: 1, customerId, step, search: searchState, itinerary, travellers, contact, held, attempt })
  }, [customerId, step, searchState, itinerary, travellers, contact, held, attempt])

  function chooseCustomer(id: string) {
    const next = data.customers.find((row) => row.id === id)
    setCustomerId(id)
    setContact({ email: next?.email ?? '', phone: next?.phone ?? '', promoCode: '' })
    setTravellers([])
    setItinerary(null)
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
    setHeld(null)
    setError(null)
    setAttempt(null)
    clearBookingDraft()
  }
  function chooseFlights(selection: SearchItinerary) {
    setItinerary(selection)
    setTravellers((current) => travellersFor(selection, current))
    setError(null)
    setStep('passengers')
  }
  function updateTraveller(key: string, change: Partial<TravellerDraft>) {
    setTravellers((current) => current.map((person) => (person.key === key ? { ...person, ...change } : person)))
    setError(null)
  }
  function continueToSeats() {
    if (!itinerary) return
    const message = validateTravellers(travellers, contact, itinerary)
    if (message) {
      setError(message)
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
  async function createHold() {
    if (!customer || !itinerary || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const validation = validateTravellers(travellers, contact, itinerary)
      if (validation) throw new Error(validation)
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
        expectedTotal: itinerary.expectedTotal,
        seats: [],
      }
      const body = JSON.stringify(request)
      /* The same request keeps the same idempotency key, so a retry after a refresh is not a second booking. */
      const next = attempt && attempt.body === body ? attempt : { body, key: crypto.randomUUID() }
      setAttempt(next)
      saveBookingDraft({ version: 1, customerId, step, search: searchState, itinerary, travellers, contact, held, attempt: next })
      const booking = await bookForCustomer(request, next.key)
      setHeld(booking)
      setStep('held')
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === 'PRICE_CHANGED'
          ? 'The fare has changed. Return to flights and check the new price. No booking was held.'
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
        <main className="f3-search f3-flow">
          <ol className="f3-flow-stepper" aria-label="Staff booking progress">
            {['Flights', 'Passengers', 'Seats', 'Booking held'].map((label, index) => (
              <li
                key={label}
                aria-current={(activeStep === 'passengers' ? 1 : activeStep === 'seats' ? 2 : 3) === index ? 'step' : undefined}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <h1>{activeStep === 'passengers' ? 'Passengers & extras' : activeStep === 'seats' ? 'Seat choices' : 'Booking held'}</h1>
          <div className="f3-flow-columns">
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
                <section className="f3-passenger-card">
                  <h2>Choose seats later</h2>
                  <p>Specific seats are optional. No seats are held until you create the booking below.</p>
                  <ul>
                    {travellers.map((person) => (
                      <li key={person.key}>
                        {person.givenName} {person.familyName} · {person.expectedType === 'infant' ? 'Travels on a lap' : 'Seat not chosen'}
                      </li>
                    ))}
                  </ul>
                  {error && (
                    <p role="alert" className="f3-flow-error">
                      {error}
                    </p>
                  )}
                  <div className="f3-flow-actions">
                    <button
                      className="f3-search-secondary"
                      disabled={busy}
                      onClick={() => {
                        setError(null)
                        setStep('passengers')
                      }}
                    >
                      Back to passengers
                    </button>
                    <button className="f3-search-primary" disabled={busy} onClick={() => void createHold()}>
                      {busy ? 'Creating booking…' : 'Skip seats & create hold'}
                    </button>
                  </div>
                </section>
              )}
              {activeStep === 'held' && held && (
                <section className="f3-passenger-card f3-staff-receipt">
                  <span className="f3-staff-held">Held · awaiting payment</span>
                  <p>Booking reference</p>
                  <h2>{held.reference}</h2>
                  <p>{customer ? `Booked for ${customer.name}.` : 'Booked for the selected customer.'} This booking is not confirmed.</p>
                  <p>
                    Total: <strong>{money(held.total, held.currency)}</strong>
                  </p>
                  <p>
                    Hold expires{' '}
                    {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(held.holdExpiresAt))}
                  </p>
                  <div className="f3-flow-actions">
                    <button className="f3-search-secondary" type="button" onClick={startNewBooking}>
                      Start a new booking
                    </button>
                    <a className="f3-search-primary" href={`/booking-lookup?reference=${encodeURIComponent(held.reference)}`}>
                      Open booking lookup
                    </a>
                  </div>
                </section>
              )}
            </div>
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
          </div>
        </main>
      )}
    </div>
  )
}
