import { Component, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { FlightSearchForm } from '../components/FlightSearchForm'
import { validateSearch } from '../components/search-validation'
import { airportCity } from '../components/airports'
import type { FlightSearchFormValue } from '../components/contracts'
import { useBookingSearchApi } from '../api/client'
import type { CabinAvailability, FlightOption, FlightSearchRequest, FlightSearchResponse } from '../api/types'
import '../search.css'

export interface SelectedFlight {
  flight: FlightOption
  fare: CabinAvailability
}
export interface SearchItinerary {
  request: FlightSearchRequest
  selections: SelectedFlight[]
  expectedTotal: number
}
interface SearchProps {
  tripLink?: { href: string; label: string }
  initialItinerary?: SearchItinerary
  onContinue?: (itinerary: SearchItinerary) => void
}
type Sort = 'price' | 'departure' | 'duration'
const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).format(value)
const time = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value))
const day = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
const cabins = { economy: 'Economy', premium_economy: 'Premium economy', business: 'Business', first: 'First' }

class SearchBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="f3-search f3-search-page">
        <h1>Flight search is unavailable</h1>
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

export function FlightSearchPage(props: SearchProps) {
  return (
    <SearchBoundary>
      <FlightSearchContent {...props} />
    </SearchBoundary>
  )
}

function FlightSearchContent({ onContinue, initialItinerary, tripLink }: SearchProps) {
  const { searchFlights } = useBookingSearchApi()
  const [form, setForm] = useState<FlightSearchFormValue>(
    initialItinerary
      ? { ...initialItinerary.request, cabin: initialItinerary.request.cabin ?? 'economy' }
      : {
          tripType: 'one_way',
          legs: [{ origin: '', destination: '', date: '' }],
          adults: 1,
          children: 0,
          infants: 0,
          cabin: 'economy',
        },
  )
  const [result, setResult] = useState<FlightSearchResponse | null>(
    initialItinerary
      ? { legs: initialItinerary.request.legs.map((leg, index) => ({ leg, options: [initialItinerary.selections[index].flight] })) }
      : null,
  )
  const [submitted, setSubmitted] = useState<FlightSearchRequest | null>(initialItinerary?.request ?? null)
  const [selected, setSelected] = useState<Array<SelectedFlight | undefined>>(initialItinerary?.selections ?? [])
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('price')
  const sequence = useRef(0)
  const abort = useRef<AbortController | null>(null)

  function changeForm(value: FlightSearchFormValue) {
    sequence.current++
    abort.current?.abort()
    setLoading(false)
    setForm(value)
    setResult(null)
    setSubmitted(null)
    setSelected([])
    setError(null)
  }
  async function search(value: FlightSearchFormValue) {
    const message = validateSearch(value)
    if (message) {
      setError(message)
      return
    }
    const { tripType, legs, adults, children, infants } = value
    const input: FlightSearchRequest = { tripType, legs, adults, children, infants }
    const current = ++sequence.current
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setLoading(true)
    setError(null)
    setResult(null)
    setSelected([])
    try {
      const response = await searchFlights(input, controller.signal)
      if (current !== sequence.current) return
      setSubmitted(input)
      setResult(response)
    } catch (cause) {
      if (current === sequence.current && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'We could not search flights. Please try again.')
    } finally {
      if (current === sequence.current) setLoading(false)
    }
  }
  const party = (submitted?.adults ?? 0) + (submitted?.children ?? 0)
  const total = selected.reduce((sum, selection) => sum + (selection?.fare.pricePerPassenger ?? 0), 0) * party
  const picked = selected.filter(Boolean).length
  const complete = !!submitted && picked === submitted.legs.length
  const noResults = result?.legs.some((leg) => leg.options.length === 0)
  const cheapest = (flight: FlightOption) =>
    Math.min(...flight.cabins.filter((fare) => !fare.unavailableReason).map((fare) => fare.pricePerPassenger))
  function sorted(options: FlightOption[]) {
    return [...options].sort((a, b) => {
      if (sort === 'price') {
        const difference = cheapest(a) - cheapest(b)
        if (!Number.isNaN(difference) && difference !== 0) return difference
      }
      if (sort === 'duration' && a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes
      return a.depAt.localeCompare(b.depAt)
    })
  }
  const tripHint =
    submitted?.tripType === 'return'
      ? 'Choose an outbound and a return flight'
      : submitted?.tripType === 'multi_city'
        ? 'Choose a flight for each leg'
        : 'Choose a flight'
  const adults = submitted?.adults ?? 0
  const children = submitted?.children ?? 0
  const partyLabel = [
    adults ? `${adults} ${adults === 1 ? 'adult' : 'adults'}` : '',
    children ? `${children} ${children === 1 ? 'child' : 'children'}` : '',
  ]
    .filter(Boolean)
    .join(', ')
  const sortOptions: Array<[Sort, string]> = [
    ['price', 'Price'],
    ['departure', 'Departure'],
    ['duration', 'Duration'],
  ]
  return (
    <main className="f3-search f3-search-page">
      <div className="f3-search-heading">
        <div>
          <h1>Find a flight</h1>
          <p className="f3-search-intro">Direct flights only. Seats and prices are checked live; nothing is reserved until you continue.</p>
        </div>
        {tripLink && (
          <a className="f3-search-trip-link" href={tripLink.href}>
            {tripLink.label}
          </a>
        )}
      </div>
      <FlightSearchForm
        value={form}
        onChange={changeForm}
        onSubmit={(value) => void search(value)}
        isLoading={isLoading}
        errorMessage={error}
      />
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
          <section className="f3-search-card f3-search-empty">
            <div className="f3-search-spinner" />
            <h2>Checking flights and availability…</h2>
            <p>This may take a moment.</p>
          </section>
        )}
        {!isLoading && !result && !error && (
          <section className="f3-search-card f3-search-empty">
            <h2>Find your flight</h2>
            <p>Choose where you are flying and when, then press Search flights to see the available flights.</p>
          </section>
        )}
        {noResults && submitted && (
          <section className="f3-search-card f3-search-no-results">
            <h2>
              No direct flights with {party} {party === 1 ? 'seat' : 'seats'} on {day(submitted.legs[0].date)}
            </h2>
            <p>
              Flights that match the route and date are sold out in this cabin or have fewer seats left than your party needs. Try another
              day or fewer passengers.
            </p>
            <p className="f3-search-banner">
              Search returns only flights that are on sale and not yet departed. Cancelled and departed flights are hidden.
            </p>
          </section>
        )}
        {result && !noResults && (
          <>
            <div className="f3-search-result-tools">
              <span />
              <div className="f3-search-sort">
                <span>Sort</span>
                {sortOptions.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {result.legs.map((leg, legIndex) => {
              const previous = selected[legIndex - 1]
              const filtered = sorted(leg.options).filter(
                (option) =>
                  submitted?.tripType !== 'multi_city' ||
                  !previous ||
                  new Date(option.depAt).getTime() >= new Date(previous.flight.arrAt).getTime() + 3600000,
              )
              const cabinColumns = (Object.keys(cabins) as Array<keyof typeof cabins>).filter((cabin) =>
                filtered.some((flight) => flight.cabins.some((fare) => fare.cabin === cabin)),
              )
              const columnStyle = { '--f3-cabin-count': Math.max(1, cabinColumns.length) } as CSSProperties
              const legLabel =
                submitted?.tripType === 'return' ? (legIndex === 0 ? 'Leg 1 · Outbound' : 'Leg 2 · Return') : `Leg ${legIndex + 1}`
              return (
                <section className="f3-search-card f3-search-results" key={legIndex} aria-label={`Leg ${legIndex + 1} results`}>
                  <header>
                    <div>
                      <p className="f3-search-eyebrow">{legLabel}</p>
                      <h2>
                        {airportCity(leg.leg.origin)} → {airportCity(leg.leg.destination)} · {day(leg.leg.date)}
                      </h2>
                    </div>
                    <span>Price per passenger</span>
                  </header>
                  {filtered.length > 0 && (
                    <div className="f3-search-cabin-headings" aria-hidden="true">
                      <span>Flight</span>
                      <div className="f3-search-cabin-columns" style={columnStyle}>
                        {cabinColumns.map((cabin) => (
                          <span key={cabin}>{cabins[cabin]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {filtered.map((flight) => (
                    <article className="f3-search-flight" key={flight.flightId}>
                      <div className="f3-search-flight-time">
                        <strong>
                          {time(flight.depAt)} <span aria-hidden="true">→</span> {time(flight.arrAt)}
                          {flight.arrAt.slice(0, 10) > flight.depAt.slice(0, 10) && (
                            <small>
                              +{Math.round((Date.parse(flight.arrAt.slice(0, 10)) - Date.parse(flight.depAt.slice(0, 10))) / 86400000)} day
                            </small>
                          )}
                        </strong>
                        <span>
                          {flight.flightNumber} · {Math.floor(flight.durationMinutes / 60)} h {flight.durationMinutes % 60} m · direct
                        </span>
                      </div>
                      <div className="f3-search-cabin-columns" style={columnStyle} role="group" aria-label={`${flight.flightNumber} fares`}>
                        {cabinColumns.map((cabin) => (
                          <div className="f3-search-cabin-cell" key={cabin}>
                            {!flight.cabins.some((fare) => fare.cabin === cabin) && (
                              <div className="f3-search-unavailable">
                                <strong>Not available</strong>
                                <span>Not offered on this flight</span>
                              </div>
                            )}
                            {flight.cabins
                              .filter((fare) => fare.cabin === cabin)
                              .map((fare) => {
                                const pickedFare =
                                  selected[legIndex]?.flight.flightId === flight.flightId &&
                                  selected[legIndex]?.fare.fareClassId === fare.fareClassId
                                return (
                                  <button
                                    key={`${fare.cabin}/${fare.fareClassId}`}
                                    className={`f3-search-fare ${pickedFare ? 'is-selected' : ''}`}
                                    disabled={!!fare.unavailableReason}
                                    aria-pressed={pickedFare}
                                    onClick={() =>
                                      setSelected((current) => {
                                        const next = current.slice(0, legIndex)
                                        next[legIndex] = { flight, fare }
                                        return next
                                      })
                                    }
                                  >
                                    <strong>{fare.unavailableReason ? 'Not available' : money(fare.pricePerPassenger)}</strong>
                                    <small className={fare.seatsLeft <= 4 ? 'f3-search-low' : ''}>
                                      {fare.unavailableReason
                                        ? fare.unavailableReason
                                        : `Fare ${fare.fareClassCode} · ${fare.seatsLeft > 9 ? '9+' : fare.seatsLeft} seats left`}
                                    </small>
                                  </button>
                                )
                              })}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              )
            })}
            <section className={`f3-search-card f3-search-summary ${picked ? 'is-picked' : ''}`} aria-label="Selected itinerary">
              <div>
                <p className="f3-search-eyebrow">Your trip</p>
                <strong>
                  {selected
                    .filter(Boolean)
                    .map((selection) => selection!.flight.flightNumber)
                    .join(' + ') || tripHint}
                </strong>
                {picked > 0 && <p>{partyLabel} · price per passenger shown</p>}
              </div>
              <div className="f3-search-total">
                <div>
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
                {onContinue && (
                  <button
                    className="f3-search-primary"
                    disabled={!complete}
                    onClick={() =>
                      onContinue({
                        request: submitted!,
                        selections: selected.filter((selection): selection is SelectedFlight => !!selection),
                        expectedTotal: Math.round(total * 100) / 100,
                      })
                    }
                  >
                    Continue to passengers
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
