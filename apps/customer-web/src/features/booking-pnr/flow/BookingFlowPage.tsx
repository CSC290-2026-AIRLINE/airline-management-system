import { useDemoPassengers } from '../passengers/useDemoPassengers'
import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FlightSearchPage, type SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import { ApiError, useBookingPnrApi } from '../api/client'
import type { HoldBookingRequest, HoldBookingResponse, HoldBookingSeat } from '../api/types'
import { PassengersPage } from '../passengers/PassengersPage'
import {
  readItinerary,
  saveItinerary,
  travellersFor,
  validateTravellers,
  type BookingContact,
  type ResolvePassengers,
  type TravellerDraft,
} from './draft'
import './flow.css'

interface FlowProps {
  resolvePassengers?: ResolvePassengers
  onHeld?: (response: HoldBookingResponse) => void
}

export function BookingFlowPage({ resolvePassengers, onHeld }: FlowProps) {
  const [itinerary, setItinerary] = useState(readItinerary)
  const [travellers, setTravellers] = useState(() => (itinerary ? travellersFor(itinerary) : []))
  const [contact, setContact] = useState<BookingContact>({ email: '', phone: '', promoCode: '' })
  const [step, setStep] = useState<1 | 2 | 3 | 4>(2)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<HoldBookingResponse | null>(null)
  const attempt = useRef<{ signature: string; key: string } | null>(null)
  const resolved = useRef<{ signature: string; ids: Array<{ key: string; passengerId: string }> } | null>(null)
  const inFlight = useRef(false)
  const { holdBooking } = useBookingPnrApi()
  const demo = useDemoPassengers(!resolvePassengers)
  const passengerResolver = resolvePassengers ?? demo.resolve

  function updateTraveller(key: string, change: Partial<TravellerDraft>) {
    setTravellers((current) => current.map((person) => (person.key === key ? { ...person, ...change } : person)))
    setError(null)
  }
  function selectItinerary(next: SearchItinerary) {
    saveItinerary(next)
    setItinerary(next)
    setTravellers((current) => travellersFor(next, current))
    setError(null)
    setStep(2)
  }
  function continueToSeats() {
    if (!itinerary) return
    const message = validateTravellers(travellers, contact, itinerary)
    setError(message)
    if (!message) setStep(3)
  }
  async function createHold(seats: HoldBookingSeat[] = []) {
    if (!itinerary || inFlight.current) return
    // Until Feature 7's resolver is agreed, fail before any hold or profile write.
    if (!passengerResolver) {
      setError('Traveller profiles are temporarily unavailable. Your details are kept on this page. Please try again later.')
      return
    }
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const signature = JSON.stringify(travellers)
      const ids = resolved.current?.signature === signature ? resolved.current.ids : await passengerResolver(travellers)
      if (
        ids.length !== travellers.length ||
        new Set(ids.map((item) => item.key)).size !== travellers.length ||
        travellers.some((person) => !ids.some((item) => item.key === person.key && item.passengerId))
      )
        throw new Error('Traveller profiles could not be verified. Please try again.')
      resolved.current = { signature, ids }
      const idFor = (key: string) => ids.find((item) => item.key === key)!.passengerId
      const request: HoldBookingRequest = {
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
        seats,
      }
      const body = JSON.stringify(request)
      if (attempt.current?.signature !== body) attempt.current = { signature: body, key: crypto.randomUUID() }
      const result = await holdBooking(request, attempt.current.key)
      setHeld(result)
      setStep(4)
      onHeld?.(result)
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PRICE_CHANGED')
        setError('The price has changed. Return to flights to check the latest price. No seats have been held.')
      else if (cause instanceof ApiError && cause.code === 'SEAT_UNAVAILABLE')
        setError('Those seats are no longer available. Return to flights and choose another option.')
      else setError(cause instanceof Error ? cause.message : 'We could not create your booking. Please try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (!itinerary)
    return (
      <main className="f3-search">
        <h1>Choose your flights first</h1>
        <p>Your itinerary is missing or unavailable.</p>
        <Link to="/search">Search flights</Link>
      </main>
    )
  if (step === 1) return <FlightSearchPage initialItinerary={itinerary} onContinue={selectItinerary} />
  return (
    <main className="f3-search f3-flow">
      <ol className="f3-flow-stepper" aria-label="Booking progress">
        {['Flights', 'Passengers', 'Seats', 'Review & pay'].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>
            <span>{step > index + 1 ? '✓' : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <h1>{step === 2 ? 'Passengers & extras' : step === 3 ? 'Choose your seats' : 'Booking held'}</h1>
      <p className="f3-search-intro">
        {step === 2
          ? 'Enter traveller details exactly as they appear on the passport.'
          : step === 3
            ? 'Seat selection is optional. You can choose later in My Trips or at check-in.'
            : 'Keep your booking reference for the next step.'}
      </p>
      <div className="f3-flow-columns">
        <div>
          {step === 2 && (
            <PassengersPage
              itinerary={itinerary}
              travellers={travellers}
              contact={contact}
              onTravellerChange={updateTraveller}
              onContactChange={setContact}
              onBack={() => {
                setError(null)
                setStep(1)
              }}
              onContinue={continueToSeats}
              error={error}
              demoProfiles={!resolvePassengers && demo.enabled ? demo.profiles : undefined}
              demoLoading={demo.loading}
              demoError={demo.error}
            />
          )}
          {step === 3 && (
            <section className="f3-passenger-card">
              <h2>Choose seats later</h2>
              <p>Your booking can be created without seat assignments. Seats are not held until you continue to review.</p>
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
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError(null)
                    setStep(2)
                  }}
                >
                  Back to passengers
                </button>
                <button className="f3-search-primary" type="button" disabled={busy} onClick={() => void createHold()}>
                  {busy ? 'Creating booking…' : 'Skip, choose seats later'}
                </button>
              </div>
            </section>
          )}
          {step === 4 && held && (
            <section className="f3-passenger-card">
              <p>Your booking reference</p>
              <h2>{held.reference}</h2>
              <p>
                Total:{' '}
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: held.currency, currencyDisplay: 'code' }).format(held.total)}
              </p>
              <p>
                Hold expires:{' '}
                {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(held.holdExpiresAt))}
              </p>
              <Link to="/bookings">Go to My Trips</Link>
            </section>
          )}
        </div>
        <aside className="f3-flow-summary" aria-label="Your trip">
          <p className="f3-search-eyebrow">YOUR TRIP</p>
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
          <p>
            {itinerary.request.adults} adults · {itinerary.request.children} children · {itinerary.request.infants} infants
          </p>
          <strong>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).format(
              itinerary.expectedTotal,
            )}
          </strong>
          <p>Seats are held for 15 minutes only after you finish the Seat step.</p>
        </aside>
      </div>
    </main>
  )
}
