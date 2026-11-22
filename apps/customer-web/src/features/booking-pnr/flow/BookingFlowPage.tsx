import { useDemoPassengers } from '../passengers/useDemoPassengers'
import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { FlightSearchPage, type SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import type { FlightSearchUrlState } from '../../booking-search/search-params'
import { ApiError, useBookingPnrApi } from '../api/client'
import type { HoldBookingRequest, HoldBookingResponse, HoldBookingSeat } from '../api/types'
import { BookingRouteBar, type BookingStep } from '../components/BookingRouteBar'
import { PassengersPage } from '../passengers/PassengersPage'
import {
  clearFlowDraft,
  readFlowDraft,
  readItinerary,
  saveFlowDraft,
  saveItinerary,
  travellersFor,
  validateTravellers,
  type BookingContact,
  type ResolvePassengers,
  type TravellerDraft,
} from './draft'
import { priceChangedDetails, validateSeatChoices, type FlowComponents, type SeatChoice } from './integration'
import type { AssistanceValue } from '../components/contracts'
import type { PriceChangedDetails } from '../api/types'
import { formatMoney } from '../lib/format'
import controls from '../styles/controls'
import '../styles/tokens.css'

/** "1 adult", "2 adults". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export interface FlowProps extends FlowComponents {
  resolvePassengers?: ResolvePassengers
  onHeld?: (response: HoldBookingResponse) => void
}

export function BookingFlowPage({ resolvePassengers, onHeld, AssistanceFields, SeatStep, PriceChangedDialog, SeatTakenDialog }: FlowProps) {
  const [itinerary, setItinerary] = useState(readItinerary)
  // The flow the customer left behind, so a refresh does not wipe what they typed.
  const [restored] = useState(() => readFlowDraft(itinerary))
  const [travellers, setTravellers] = useState(() => restored?.travellers ?? (itinerary ? travellersFor(itinerary) : []))
  const [contact, setContact] = useState<BookingContact>(() => restored?.contact ?? { email: '', phone: '', promoCode: '' })
  const [step, setStep] = useState<BookingStep>(() => restored?.step ?? 2)
  const [error, setError] = useState<string | null>(null)
  /* Whether the customer has tried to go on to the seats. The messages under the fields wait for that, so the form is
     not full of red text before anything has been typed. */
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [held, setHeld] = useState<HoldBookingResponse | null>(() => restored?.held ?? null)
  const [assistance, setAssistance] = useState<Record<string, AssistanceValue>>(() => restored?.assistance ?? {})
  const [choices, setChoices] = useState<SeatChoice[]>(() => restored?.choices ?? [])
  // The search the customer had open on the flights step, so a refresh there does not wipe it.
  const [searchDraft, setSearchDraft] = useState<FlightSearchUrlState | null>(() => restored?.search ?? null)
  const [priceChange, setPriceChange] = useState<PriceChangedDetails | null>(null)
  const [seatConflict, setSeatConflict] = useState(false)
  const pendingRequest = useRef<HoldBookingRequest | null>(null)
  const attempt = useRef<{ signature: string; key: string } | null>(null)
  const resolved = useRef<{ signature: string; ids: Array<{ key: string; passengerId: string }> } | null>(null)
  const inFlight = useRef(false)
  const { holdBooking } = useBookingPnrApi()
  const demo = useDemoPassengers(!resolvePassengers)
  const passengerResolver = resolvePassengers ?? demo.resolve

  /* The flow is kept in the session, so a refresh does not wipe the passenger details, the seats and the contact.
     The details stay in sessionStorage, never in the address bar. */
  useEffect(() => {
    if (!itinerary) {
      clearFlowDraft()
      return
    }
    saveFlowDraft(itinerary, { step, travellers, contact, assistance, choices, held, search: searchDraft })
  }, [itinerary, step, travellers, contact, assistance, choices, held, searchDraft])

  function updateTraveller(key: string, change: Partial<TravellerDraft>) {
    setTravellers((current) => current.map((person) => (person.key === key ? { ...person, ...change } : person)))
    setAssistance((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setChoices([])
    setPriceChange(null)
    setError(null)
  }
  function selectItinerary(next: SearchItinerary) {
    setAssistance({})
    setChoices([])
    setPriceChange(null)
    saveItinerary(next)
    setItinerary(next)
    setTravellers((current) => travellersFor(next, current))
    setError(null)
    /* The party may have changed, so the messages about the old one do not apply any more. */
    setAttempted(false)
    setStep(2)
  }
  function continueToSeats() {
    if (!itinerary) return
    /* The messages under the fields appear from the first try, and follow the values from then on, so a fixed field
       loses its message right away. */
    setAttempted(true)
    const issues = validateTravellers(travellers, contact, itinerary)
    const missingNote = Object.values(assistance).some(
      (value) =>
        (value.serviceCodes ?? (value.serviceCode ? [value.serviceCode] : [])).some((code) => code === 'UMNR' || code === 'MEDA') &&
        !value.note.trim(),
    )
    // Report every problem in one go, so the customer does not fix the form one message at a time.
    if (issues || missingNote) {
      setError(missingNote ? 'Add a note for each UMNR or MEDA assistance request.' : null)
      return
    }
    setError(null)
    setStep(3)
  }
  /** The route bar sends the customer back to a step they have finished. */
  function goToStep(next: BookingStep) {
    if (next >= step) return
    setError(null)
    setPriceChange(null)
    setStep(next)
  }
  async function createHold(selected: SeatChoice[] = choices, retry?: HoldBookingRequest, expectedTotal?: number) {
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
      const validation = validateTravellers(travellers, contact, itinerary)
      if (validation) throw new Error(validation.message)
      validateSeatChoices(selected, travellers, itinerary)
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
      const seats: HoldBookingSeat[] = selected.map((choice) => ({
        passengerId: idFor(choice.travellerKey),
        flightId: choice.flightId,
        seatCode: choice.seatCode,
      }))
      const request: HoldBookingRequest = retry ?? {
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
        contactPhone: contact.phone.trim() || undefined,
        promoCode: contact.promoCode.trim() || undefined,
        expectedTotal: expectedTotal ?? itinerary.expectedTotal,
        seats,
        serviceRequests: travellers.flatMap((person) => {
          const value = assistance[person.key]
          return (value?.serviceCodes ?? (value?.serviceCode ? [value.serviceCode] : [])).map((serviceCode) => ({
            passengerId: idFor(person.key),
            serviceCode,
            note: value.note.trim() || undefined,
          }))
        }),
      }
      pendingRequest.current = request
      const body = JSON.stringify(request)
      if (attempt.current?.signature !== body) attempt.current = { signature: body, key: crypto.randomUUID() }
      const result = await holdBooking(request, attempt.current.key)
      setHeld(result)
      setStep(4)
      setPriceChange(null)
      // A navigation failure must not be reported as a failed hold.
      try {
        onHeld?.(result)
      } catch {
        setError('Your booking was held. Use the reference below to continue.')
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'PRICE_CHANGED') {
        setPriceChange(priceChangedDetails(cause.details))
        setError('The price has changed. Return to flights to check the latest price. No seats have been held.')
      } else if (cause instanceof ApiError && cause.code === 'SEAT_UNAVAILABLE') {
        setSeatConflict(true)
        setError('Those seats are no longer available. Return to flights and choose another option.')
      } else if (cause instanceof ApiError && cause.code === 'FARE_UNAVAILABLE') {
        // A sold-out fare class is not a seat conflict, so the seat dialog stays closed.
        setError('This fare is no longer available. Return to flights and choose another option.')
      } else setError(cause instanceof Error ? cause.message : 'We could not create your booking. Please try again.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  if (!itinerary)
    return (
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-left md:py-10 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
        <h1>Choose your flights first</h1>
        <p>Your itinerary is missing or unavailable.</p>
        <Link to="/search">Search flights</Link>
      </main>
    )
  const tripCurrency = held?.currency ?? itinerary.selections[0]?.fare.currency ?? 'USD'
  const tripSummary = (
    <div className="space-y-3 [&_h2]:text-xs [&_h2]:font-medium [&_h2]:text-muted-foreground [&_article]:border-b [&_article]:pb-3 [&_article_p]:mt-1 [&_article_p]:text-xs [&_article_p]:text-muted-foreground">
      <h2>Your trip</h2>
      {itinerary.selections.map(({ flight, fare }) => (
        <article key={flight.flightId}>
          <strong>
            {flight.origin} → {flight.destination}
          </strong>
          <p>
            {flight.flightNumber} · {fare.cabin.replaceAll('_', ' ')}
          </p>
          <p>
            {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: flight.originTimeZone }).format(
              new Date(flight.depAt),
            )}
          </p>
        </article>
      ))}
      <p>
        {count(itinerary.request.adults, 'adult', 'adults')} · {count(itinerary.request.children, 'child', 'children')} ·{' '}
        {count(itinerary.request.infants, 'infant', 'infants')}
      </p>
      {step !== 3 && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
          <span>Fare quote</span>
          <strong>{formatMoney(itinerary.expectedTotal, tripCurrency)}</strong>
        </div>
      )}
    </div>
  )
  if (step === 1)
    return (
      <FlightSearchPage
        // With a stored search the page brings back that search, so the results of the old itinerary must not show
        // under the edited form.
        initialItinerary={searchDraft ? undefined : itinerary}
        urlState={searchDraft ?? undefined}
        onUrlChange={(next) => setSearchDraft(next)}
        onContinue={selectItinerary}
      />
    )
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-left md:py-10 [&_h1]:m-0 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold">
      <h1>{step === 2 ? 'Passengers & extras' : step === 3 ? 'Choose your seats' : 'Booking held'}</h1>
      {step !== 3 && (
        <p className="text-muted-foreground">
          {step === 2
            ? 'Enter traveller details exactly as they appear on the passport.'
            : 'Keep your booking reference for the next step.'}
        </p>
      )}
      <div className="">
        <BookingRouteBar currentStep={step} onStepClick={goToStep} />
      </div>
      {priceChange && PriceChangedDialog && (
        <PriceChangedDialog
          {...{
            open: true,
            ...priceChange,
            onCancel: () => {
              if (!inFlight.current) {
                setPriceChange(null)
                setStep(1)
              }
            },
            onContinue: () => {
              if (inFlight.current || !pendingRequest.current) return
              const request = { ...pendingRequest.current, expectedTotal: priceChange.newTotal }
              setItinerary({ ...itinerary, expectedTotal: priceChange.newTotal })
              setPriceChange(null)
              void createHold(choices, request)
            },
          }}
        />
      )}
      {seatConflict && SeatTakenDialog && (
        <SeatTakenDialog
          {...{
            open: true,
            seatCode: null,
            onChooseAnother: () => {
              setSeatConflict(false)
              setPriceChange(null)
              setError(null)
            },
            onClose: () => setSeatConflict(false),
          }}
        />
      )}
      <div
        className={`grid items-start gap-6 [&>div]:min-w-0 ${step === 3 && SeatStep ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]'}`}
      >
        <div>
          {step === 2 && (
            <>
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
                issues={attempted ? validateTravellers(travellers, contact, itinerary) : null}
                demoProfiles={!resolvePassengers && demo.enabled ? demo.profiles : undefined}
                demoLoading={demo.loading}
                demoError={demo.error}
                lockDetails={false}
                renderAssistance={
                  AssistanceFields
                    ? (person) => (
                        <div className="space-y-3 border-t pt-4 [&_h3]:m-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3_span]:font-normal [&_h3_span]:text-muted-foreground">
                          <AssistanceFields
                            value={assistance[person.key] ?? { serviceCode: null, note: '' }}
                            bookingMode
                            disabled={busy}
                            onChange={(value) => {
                              setAssistance((current) => ({ ...current, [person.key]: value }))
                              setError(null)
                            }}
                          />
                        </div>
                      )
                    : undefined
                }
              />
            </>
          )}
          {step === 3 &&
            (SeatStep ? (
              <SeatStep
                {...{
                  itinerary,
                  currency: tripCurrency,
                  travellers,
                  choices,
                  busy,
                  error,
                  promoCode: contact.promoCode.trim() || undefined,
                  onChange: (next) => {
                    if (!inFlight.current) {
                      setChoices(next)
                      setPriceChange(null)
                    }
                  },
                  onBack: () => {
                    if (!inFlight.current) {
                      setError(null)
                      setPriceChange(null)
                      setStep(2)
                    }
                  },
                  onContinue: (expectedTotal) => void createHold(choices, undefined, expectedTotal),
                  onSkip: (expectedTotal, remainingChoices = []) => {
                    if (!inFlight.current) {
                      setChoices(remainingChoices)
                      void createHold(remainingChoices, undefined, expectedTotal)
                    }
                  },
                }}
              />
            ) : (
              <section className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0 space-y-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground">
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
                  <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                  <button
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      setStep(2)
                    }}
                  >
                    Back to passengers
                  </button>
                  <button
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                    type="button"
                    disabled={busy}
                    onClick={() => void createHold()}
                  >
                    {busy ? 'Creating booking…' : 'Skip, choose seats later'}
                  </button>
                </div>
              </section>
            ))}
          {step === 4 && error && (
            <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {step === 4 && held && (
            <section className="rounded-xl border bg-card text-card-foreground shadow-sm min-w-0 space-y-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground">
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
              <div className="flex flex-wrap gap-2">
                <Link to="/bookings" className={controls.secondary}>
                  Go to My Trips
                </Link>
              </div>
            </section>
          )}
        </div>
        {!(step === 3 && SeatStep) && (
          <aside
            className="order-2 space-y-3 rounded-xl border bg-card text-card-foreground shadow-sm p-5 md:order-none lg:sticky lg:top-16 [&_article]:border-b [&_article]:pb-3 [&_article_p]:mt-1 [&_article_p]:text-xs [&_article_p]:text-muted-foreground [&>strong]:block [&>strong]:text-xl [&>strong]:tabular-nums"
            aria-label="Your trip"
          >
            {tripSummary}
            <p>Seats are held for 15 minutes only after you finish the Seat step.</p>
          </aside>
        )}
      </div>
    </main>
  )
}
