import { Component, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { FlightSearchForm } from '../components/FlightSearchForm'
import { validateSearch } from '../components/search-validation'
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
  initialItinerary?: SearchItinerary
  onContinue?: (itinerary: SearchItinerary) => void
}
type Sort = 'price' | 'departure' | 'duration'
const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencyDisplay: 'code' }).format(value)
const time = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value))
const cabins = { economy: 'Economy', premium_economy: 'Premium economy', business: 'Business', first: 'First' }

class SearchBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="f3-search">
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

function FlightSearchContent({ onContinue, initialItinerary }: SearchProps) {
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
  const total =
    selected.reduce((sum, selection) => sum + (selection?.fare.pricePerPassenger ?? 0), 0) *
    ((submitted?.adults ?? 0) + (submitted?.children ?? 0))
  const complete = !!submitted && selected.filter(Boolean).length === submitted.legs.length
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
  return (
    <main className="f3-search">
      <div className="f3-search-heading">
        <div>
          <p className="f3-search-eyebrow">FLYTHON · BOOK A FLIGHT</p>
          <h1>Find a flight</h1>
        </div>
        <Link to="/bookings">My Trips →</Link>
      </div>
      <p className="f3-search-intro">Direct flights only. Seats and prices are checked live; searching does not reserve seats.</p>
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
            <span aria-hidden="true" className="f3-search-plane">
              ↗
            </span>
            <h2>Find your flight</h2>
            <p>Choose where you are flying and when, then press Search flights to see the available flights.</p>
          </section>
        )}
        {noResults && (
          <section className="f3-search-card f3-search-empty">
            <h2>No results</h2>
            <p>No flights are available for this itinerary and party. Adjust your search and try again.</p>
          </section>
        )}
        {result && !noResults && (
          <>
            <div className="f3-search-result-tools">
              <p>Choose one fare for each leg.</p>
              <label>
                Sort by{' '}
                <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                  <option value="price">Price</option>
                  <option value="departure">Departure</option>
                  <option value="duration">Duration</option>
                </select>
              </label>
            </div>
            {result.legs.map((leg, legIndex) => {
              const previous = selected[legIndex - 1]
              const filtered = sorted(leg.options).filter(
                (option) =>
                  submitted?.tripType !== 'multi_city' ||
                  !previous ||
                  new Date(option.depAt).getTime() >= new Date(previous.flight.arrAt).getTime() + 3600000,
              )
              return (
                <section className="f3-search-card f3-search-results" key={legIndex} aria-label={`Leg ${legIndex + 1} results`}>
                  <header>
                    <div>
                      <p className="f3-search-eyebrow">
                        LEG {legIndex + 1}
                        {submitted?.tripType === 'return' ? (legIndex === 0 ? ' · OUTBOUND' : ' · RETURN') : ''}
                      </p>
                      <h2>
                        {leg.leg.origin} → {leg.leg.destination}
                      </h2>
                      <p>
                        {new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
                          new Date(`${leg.leg.date}T12:00:00Z`),
                        )}
                      </p>
                    </div>
                    <span>Price per passenger</span>
                  </header>
                  {!filtered.length && (
                    <p className="f3-search-connection">
                      No flights depart at least 60 minutes after your previous arrival. Choose a different flight or adjust your search.
                    </p>
                  )}
                  {filtered.map((flight) => (
                    <article className="f3-search-flight" key={flight.flightId}>
                      <div className="f3-search-flight-time">
                        <strong>
                          {time(flight.depAt)} <span aria-hidden="true">→</span> {time(flight.arrAt)}
                        </strong>
                        <span>
                          {flight.flightNumber} · {Math.floor(flight.durationMinutes / 60)} h {flight.durationMinutes % 60} m · direct
                        </span>
                        <small>
                          Times shown in UTC
                          {flight.arrAt.slice(0, 10) > flight.depAt.slice(0, 10)
                            ? ` · +${Math.round((Date.parse(flight.arrAt.slice(0, 10)) - Date.parse(flight.depAt.slice(0, 10))) / 86400000)} day`
                            : ''}
                        </small>
                      </div>
                      <div className="f3-search-fares" role="group" aria-label={`${flight.flightNumber} fares`}>
                        {flight.cabins.map((fare) => {
                          const picked =
                            selected[legIndex]?.flight.flightId === flight.flightId &&
                            selected[legIndex]?.fare.fareClassId === fare.fareClassId
                          return (
                            <button
                              key={`${fare.cabin}/${fare.fareClassId}`}
                              className={`f3-search-fare ${picked ? 'is-selected' : ''}`}
                              disabled={!!fare.unavailableReason}
                              aria-pressed={picked}
                              onClick={() =>
                                setSelected((current) => {
                                  const next = current.slice(0, legIndex)
                                  next[legIndex] = { flight, fare }
                                  return next
                                })
                              }
                            >
                              <span>
                                {cabins[fare.cabin]} · {fare.fareClassCode}
                              </span>
                              <strong>{fare.unavailableReason ? 'Not available' : money(fare.pricePerPassenger)}</strong>
                              <small className={fare.seatsLeft <= 4 ? 'f3-search-low' : ''}>
                                {fare.unavailableReason ?? `${fare.seatsLeft > 9 ? '9+' : fare.seatsLeft} seats left`}
                              </small>
                              {picked && <span className="f3-search-selected">✓ Selected</span>}
                            </button>
                          )
                        })}
                      </div>
                    </article>
                  ))}
                </section>
              )
            })}
            <section className="f3-search-card f3-search-summary" aria-label="Selected itinerary">
              <div>
                <p className="f3-search-eyebrow">YOUR TRIP</p>
                <strong>
                  {selected
                    .filter(Boolean)
                    .map((selection) => selection!.flight.flightNumber)
                    .join(' + ') || 'Choose a flight for each leg'}
                </strong>
                <p>
                  {submitted!.adults} adult{submitted!.adults === 1 ? '' : 's'} · {submitted!.children} children · {submitted!.infants}{' '}
                  infants
                </p>
                <p>
                  {complete
                    ? 'All flights selected. No seats have been held.'
                    : `${selected.filter(Boolean).length} of ${result.legs.length} flights selected`}
                </p>
              </div>
              <div className="f3-search-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
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
