import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Card, CardContent, CardTitle } from '@staff-web/components/ui/card'
import { Field, FieldLabel } from '@staff-web/components/ui/field'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { CircleAlert, Info } from 'lucide-react'
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 text-left md:py-10 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
        <h1>Staff booking is unavailable</h1>
        <p>Refresh the page to try again.</p>
        <Button onClick={() => window.location.reload()}>Refresh page</Button>
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
    <div className="flex flex-col">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 text-left md:py-10 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold pb-0 md:pb-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1>Book for customer</h1>
          </div>
        </div>
        <p className="m-0 text-muted-foreground">Select a customer, then choose flights and enter the booking details on their behalf.</p>
        {import.meta.env.DEV && (
          <Alert>
            <Info />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <strong>Development demo booking</strong>
              <p>Only the seeded demo customer and travellers are available. Bookings use the real inventory hold.</p>
            </AlertDescription>
          </Alert>
        )}
        {data.error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription className="flex flex-wrap items-center gap-2">{data.error}</AlertDescription>
          </Alert>
        )}
        {customerMissing && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              That customer is no longer available. Choose a customer again to continue.
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent className="space-y-2.5">
            <Field className="max-w-xl">
              <FieldLabel htmlFor="staff-booking-customer">Customer</FieldLabel>
              <Select
                value={customerMissing ? '' : customerId}
                disabled={data.loading || !!data.error || busy || activeStep === 'held'}
                onValueChange={(value) => chooseCustomer(value)}
                required
              >
                <SelectTrigger id="staff-booking-customer" className="w-full">
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
            </Field>
            {customer && (
              <p className="text-sm text-muted-foreground">
                {customer.email} · {customer.phone}
              </p>
            )}
          </CardContent>
        </Card>
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
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 text-left md:py-10 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
          <header className="space-y-1">
            <h1>{stageCopy.title}</h1>
            <p className="text-muted-foreground">{stageCopy.intro}</p>
          </header>
          <StaffBookingStepper stages={STAFF_BOOKING_STAGES} current={stageIndex} />
          <div
            className={`grid items-start gap-6 [&>div]:min-w-0 ${activeStep === 'seats' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]'}`}
          >
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
                <Card className="min-w-0 gap-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground">
                  <span className="inline-flex w-fit rounded-md border border-warning/25 bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                    Held · awaiting payment
                  </span>
                  <p className="text-xs font-medium text-muted-foreground">Booking reference</p>
                  <h2 className="font-mono text-3xl font-semibold tracking-widest">{held.reference}</h2>
                  <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5 border-y py-4 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-semibold">
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
                  <p className="text-sm text-muted-foreground">
                    This booking is not confirmed. The hold ends when the timer runs out or the booking is cancelled.
                  </p>
                  <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                    <Button
                      variant="outline"

                      type="button"
                      onClick={startNewBooking}
                    >
                      Start a new booking
                    </Button>
                    <Button asChild>
                      <Link to="/booking-lookup" search={{ reference: held.reference }}>
                        Open booking lookup
                      </Link>
                    </Button>
                  </div>
                </Card>
              )}
            </div>
            {activeStep !== 'seats' && (
              <Card className="order-2 md:order-none lg:sticky lg:top-16" aria-label="Staff trip summary">
                <CardContent className="space-y-3">
                  <CardTitle>Your customer’s trip</CardTitle>
                  {itinerary.selections.map(({ flight, fare }) => (
                    <article key={flight.flightId} className="space-y-1 border-b pb-3">
                      <strong>
                        {flight.origin} → {flight.destination}
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {flight.flightNumber} · {fare.cabin.replace('_', ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: flight.originTimeZone,
                        }).format(new Date(flight.depAt))}
                      </p>
                    </article>
                  ))}
                  <strong className="block text-xl tabular-nums">{money(itinerary.expectedTotal, tripCurrency)}</strong>
                  <p className="text-xs text-muted-foreground">The hold lasts 15 minutes from booking creation.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      )}
    </div>
  )
}
