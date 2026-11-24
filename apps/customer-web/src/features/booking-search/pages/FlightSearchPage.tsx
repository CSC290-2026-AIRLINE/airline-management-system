import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BookingRouteBar } from '../../booking-pnr/components/BookingRouteBar'
import { PageShell, PageTitle } from '../../booking-pnr/components/PageShell'
import { FlightSearchForm } from '../components/FlightSearchForm'
import { validateSearch } from '../components/search-validation'
import { airportCity } from '../components/airports'
import type { FlightSearchFormValue } from '../components/contracts'
import { useBookingSearchApi } from '../api/client'
import type { CabinAvailability, FlightOption, FlightSearchRequest, FlightSearchResponse } from '../api/types'
import { defaultFlightSearchValue, type FlightSearchPick, type FlightSearchSort, type FlightSearchUrlState } from '../search-params'

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
  /** The search state read from the URL. When it is missing the page keeps everything in memory. */
  urlState?: FlightSearchUrlState
  /** Called whenever the search state changes, so the route can write it to the URL. */
  onUrlChange?: (next: FlightSearchUrlState) => void
}
type Sort = FlightSearchSort
/** What came back from a search. */
type SearchOutcome = { status: 'found'; response: FlightSearchResponse } | { status: 'failed'; message: string } | { status: 'stale' }
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(value)
// Each time is shown in its own airport's local time.
const time = (value: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(value))
/** The local calendar day (YYYY-MM-DD) of an instant at an airport. */
const localDay = (value: string, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(value))
const day = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${value}T12:00:00Z`),
  )
const cabins = { economy: 'Economy', premium_economy: 'Premium economy', business: 'Business', first: 'First' }

/** The request the API takes: the form without the cabin, which is a display-only choice for now. */
function requestFrom(value: FlightSearchFormValue): FlightSearchRequest {
  const { tripType, legs, adults, children, infants } = value
  return { tripType, legs, adults, children, infants }
}

/** The picked fares as they travel in the URL: one entry per leg, `undefined` where nothing is picked. */
function picksFromSelections(selections: Array<SelectedFlight | undefined>, legCount: number): Array<FlightSearchPick | undefined> {
  return Array.from({ length: legCount }, (_, index) => {
    const selection = selections[index]
    return selection ? { flightId: selection.flight.flightId, fareClassId: selection.fare.fareClassId } : undefined
  })
}

/** The picked fares matched back against a fresh result. A fare that is gone or sold out is dropped. */
function selectionsFromPicks(
  response: FlightSearchResponse,
  picks: Array<FlightSearchPick | undefined>,
): Array<SelectedFlight | undefined> {
  return response.legs.map((leg, index) => {
    const pick = picks[index]
    if (!pick) return undefined
    const flight = leg.options.find((option) => option.flightId === pick.flightId)
    const fare = flight?.cabins.find((candidate) => candidate.fareClassId === pick.fareClassId && !candidate.unavailableReason)
    return flight && fare ? { flight, fare } : undefined
  })
}

class SearchBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <PageShell className="[&_h1]:m-0 [&_h2]:m-0 [&_h2]:text-subheading">
        <h1>Flight search is unavailable</h1>
        <p>Refresh the page to try again.</p>
        <button
          className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm sm:h-9 sm:w-auto font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => window.location.reload()}
        >
          Refresh page
        </button>
      </PageShell>
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

function FlightSearchContent({ onContinue, initialItinerary, tripLink, urlState, onUrlChange }: SearchProps) {
  const { searchFlights } = useBookingSearchApi()
  const [form, setForm] = useState<FlightSearchFormValue>(
    urlState?.form ??
      (initialItinerary ? { ...initialItinerary.request, cabin: initialItinerary.request.cabin ?? 'economy' } : defaultFlightSearchValue()),
  )
  const [result, setResult] = useState<FlightSearchResponse | null>(
    initialItinerary
      ? { legs: initialItinerary.request.legs.map((leg, index) => ({ leg, options: [initialItinerary.selections[index].flight] })) }
      : null,
  )
  const [submitted, setSubmitted] = useState<FlightSearchRequest | null>(initialItinerary?.request ?? null)
  const [selected, setSelected] = useState<Array<SelectedFlight | undefined>>(initialItinerary?.selections ?? [])
  const [isLoading, setLoading] = useState(urlState?.submitted ?? false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>(urlState?.sort ?? 'price')
  const sequence = useRef(0)
  const abort = useRef<AbortController | null>(null)

  /* Hands the new state to the route, which writes it to the URL. Without a route (the booking flow, the staff app)
     the page keeps its state in memory as before. */
  function persist(next: FlightSearchUrlState) {
    if (!onUrlChange) return
    onUrlChange(next)
  }

  function changeForm(value: FlightSearchFormValue) {
    sequence.current++
    abort.current?.abort()
    setLoading(false)
    setForm(value)
    setResult(null)
    setSubmitted(null)
    setSelected([])
    setError(null)
    persist({ form: value, submitted: false, sort, picks: [] })
  }
  /* Asks the API for a search. The page is only touched once the answer is in, so a slow answer cannot overwrite a
     newer search. */
  async function fetchSearch(input: FlightSearchRequest): Promise<SearchOutcome> {
    const current = ++sequence.current
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const response = await searchFlights(input, controller.signal)
      if (current !== sequence.current) return { status: 'stale' }
      return { status: 'found', response }
    } catch (cause) {
      if (current !== sequence.current || controller.signal.aborted) return { status: 'stale' }
      return { status: 'failed', message: cause instanceof Error ? cause.message : 'We could not search flights. Please try again.' }
    }
  }
  /* Puts a finished search on the page. */
  function applyOutcome(outcome: SearchOutcome, input: FlightSearchRequest, picks: Array<FlightSearchPick | undefined>) {
    if (outcome.status === 'failed') {
      setError(outcome.message)
      setLoading(false)
      return
    }
    if (outcome.status !== 'found') return
    setSubmitted(input)
    setResult(outcome.response)
    setSelected(selectionsFromPicks(outcome.response, picks))
    setLoading(false)
  }
  function submit(value: FlightSearchFormValue) {
    const message = validateSearch(value)
    if (message) {
      setError(message)
      return
    }
    const input = requestFrom(value)
    setLoading(true)
    setError(null)
    setResult(null)
    setSelected([])
    setSubmitted(input)
    persist({ form: value, submitted: true, sort, picks: [] })
    void (async () => {
      applyOutcome(await fetchSearch(input), input, [])
    })()
  }
  /* A fare was clicked: remember it in the URL so a refresh keeps the same selection. */
  function pickFare(legIndex: number, flight: FlightOption, fare: CabinAvailability) {
    const next = selected.slice(0, legIndex)
    next[legIndex] = { flight, fare }
    setSelected(next)
    persist({ form, submitted: submitted !== null, sort, picks: picksFromSelections(next, form.legs.length) })
  }
  function changeSort(value: Sort) {
    setSort(value)
    persist({ form, submitted: submitted !== null, sort: value, picks: picksFromSelections(selected, form.legs.length) })
  }

  /* The page opens on a URL that holds a search: run it again and pick the same fares. */
  useEffect(() => {
    if (!urlState?.submitted) return
    const input = requestFrom(urlState.form)
    const picks = urlState.picks
    let cancelled = false
    ;(async () => {
      const outcome = await fetchSearch(input)
      if (cancelled) return
      applyOutcome(outcome, input, picks)
    })()
    return () => {
      cancelled = true
    }
    // The search runs once, when the page opens. The URL it comes from is fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const party = (submitted?.adults ?? 0) + (submitted?.children ?? 0)
  const total = selected.reduce((sum, selection) => sum + (selection?.fare.pricePerPassenger ?? 0), 0) * party
  // Before anything is picked, the total shows in the results' currency rather than a fixed USD.
  const tripCurrency = selected.find((selection) => !!selection)?.fare.currency ?? result?.legs[0]?.options[0]?.cabins[0]?.currency ?? 'USD'
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
        ? 'Choose a flight for each destination'
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
    <PageShell className="[&_h1]:m-0 [&_h2]:m-0 [&_h2]:text-subheading">
      <PageTitle
        title="Find a flight"
        subtitle="Direct flights only. Seats and prices are checked live; nothing is reserved until you continue."
        actions={
          tripLink ? (
            <a className="text-sm font-medium text-link underline-offset-4 hover:underline" href={tripLink.href}>
              {tripLink.label}
            </a>
          ) : undefined
        }
      />
      <div className="">
        <BookingRouteBar currentStep={1} />
      </div>
      <FlightSearchForm value={form} onChange={changeForm} onSubmit={submit} isLoading={isLoading} errorMessage={error} />
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
          <section className="rounded-xl border bg-card text-card-foreground shadow-sm px-5 py-11 text-center [&_p]:mx-auto [&_p]:mt-2 [&_p]:max-w-[520px] [&_p]:text-muted-foreground">
            <div className="mx-auto mb-4 size-6 animate-spin rounded-full border-[3px] border-border border-t-primary motion-reduce:animate-none" />
            <h2>Checking flights and availability…</h2>
            <p>This may take a moment.</p>
          </section>
        )}
        {!isLoading && !result && !error && (
          <section className="rounded-xl border bg-card text-card-foreground shadow-sm px-5 py-11 text-center [&_p]:mx-auto [&_p]:mt-2 [&_p]:max-w-[520px] [&_p]:text-muted-foreground">
            <h2>Find your flight</h2>
            <p>Choose where you are flying and when, then press Search flights to see the available flights.</p>
          </section>
        )}
        {noResults && submitted && (
          <section className="rounded-xl border bg-card text-card-foreground shadow-sm space-y-2 p-6 [&>p]:text-muted-foreground">
            <h2>
              No direct flights with {party} {party === 1 ? 'seat' : 'seats'} on {day(submitted.legs[0].date)}
            </h2>
            <p>
              Flights that match the route and date are sold out in this cabin or have fewer seats left than your party needs. Try another
              day or fewer passengers.
            </p>
            <p className="rounded-lg border border-link/20 bg-link/5 px-4 py-3 text-sm text-link">
              Search returns only flights that are on sale and not yet departed. Cancelled and departed flights are hidden.
            </p>
          </section>
        )}
        {result && !noResults && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                Prices and availability checked live
              </span>
              <div className="flex flex-wrap items-center gap-2 [&>span]:text-xs [&>span]:font-medium [&>span]:text-muted-foreground [&_button]:h-8 [&_button]:cursor-pointer [&_button]:rounded-md [&_button]:border [&_button]:bg-background [&_button]:px-3 [&_button]:text-sm [&_button]:font-medium [&_button]:shadow-xs [&_button:hover]:bg-accent [&_button[aria-pressed=true]]:border-primary [&_button[aria-pressed=true]]:bg-primary [&_button[aria-pressed=true]]:text-primary-foreground">
                <span>Sort</span>
                {sortOptions.map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={sort === value} onClick={() => changeSort(value)}>
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
                submitted?.tripType === 'return'
                  ? legIndex === 0
                    ? 'Outbound'
                    : 'Return'
                  : submitted?.tripType === 'multi_city'
                    ? `Destination ${legIndex + 1}`
                    : null
              return (
                <section
                  className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden [&_header]:flex [&_header]:flex-wrap [&_header]:items-start [&_header]:justify-between [&_header]:gap-x-4 [&_header]:gap-y-1 [&_header]:px-4 [&_header]:py-3 [&_header>span]:self-center [&_header>span]:text-sm [&_header>span]:text-muted-foreground"
                  key={legIndex}
                  aria-label={legLabel ? `${legLabel} results` : 'Flight results'}
                >
                  <header>
                    <div>
                      {legLabel && (
                        <p className="w-fit rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                          {legLabel}
                        </p>
                      )}
                      <h2>
                        {airportCity(leg.leg.origin)} → {airportCity(leg.leg.destination)} · {day(leg.leg.date)}
                      </h2>
                    </div>
                    <span>Price per passenger</span>
                  </header>
                  {filtered.length > 0 && (
                    <div
                      className="hidden gap-5 border-t bg-muted/40 px-4 py-2.5 md:grid md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[385px_minmax(0,1fr)] [&_span]:text-xs [&_span]:font-medium [&_span]:text-muted-foreground"
                      aria-hidden="true"
                    >
                      <span>Flight</span>
                      <div
                        className="grid grid-cols-2 gap-3 md:max-w-[calc(var(--f3-cabin-count)*250px+(var(--f3-cabin-count)-1)*12px)] md:grid-cols-[repeat(var(--f3-cabin-count),minmax(0,1fr))]"
                        style={columnStyle}
                      >
                        {cabinColumns.map((cabin) => (
                          <span key={cabin}>{cabins[cabin]}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {filtered.map((flight) => (
                    <article
                      className="grid grid-cols-1 gap-4 border-t px-4 py-3 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[385px_minmax(0,1fr)]"
                      key={flight.flightId}
                    >
                      <div className="flex flex-col justify-center gap-1 [&>strong]:text-lg [&>strong]:font-semibold [&>strong]:tabular-nums [&>strong_span]:mx-1.5 [&>strong_span]:text-muted-foreground [&>strong_small]:ml-1.5 [&>strong_small]:text-xs [&>strong_small]:font-medium [&>strong_small]:text-muted-foreground [&>span]:text-sm [&>span]:text-muted-foreground">
                        <strong>
                          {time(flight.depAt, flight.originTimeZone)} <span aria-hidden="true">→</span>{' '}
                          {time(flight.arrAt, flight.destinationTimeZone)}
                          {localDay(flight.arrAt, flight.destinationTimeZone) > localDay(flight.depAt, flight.originTimeZone) && (
                            <small>
                              +
                              {Math.round(
                                (Date.parse(localDay(flight.arrAt, flight.destinationTimeZone)) -
                                  Date.parse(localDay(flight.depAt, flight.originTimeZone))) /
                                  86400000,
                              )}{' '}
                              day
                            </small>
                          )}
                        </strong>
                        <span>
                          {flight.flightNumber} · {Math.floor(flight.durationMinutes / 60)} h {flight.durationMinutes % 60} m · direct
                        </span>
                      </div>
                      <div
                        className="grid grid-cols-2 gap-3 md:max-w-[calc(var(--f3-cabin-count)*250px+(var(--f3-cabin-count)-1)*12px)] md:grid-cols-[repeat(var(--f3-cabin-count),minmax(0,1fr))]"
                        style={columnStyle}
                        role="group"
                        aria-label={`${flight.flightNumber} fares`}
                      >
                        {cabinColumns.map((cabin) => (
                          <div className="flex min-w-0 flex-col gap-2" key={cabin}>
                            {!flight.cabins.some((fare) => fare.cabin === cabin) && (
                              <div className="flex min-h-14 flex-col gap-1 rounded-lg border border-dashed px-3 py-2.5 [&_strong]:text-sm [&_strong]:font-semibold [&_strong]:text-muted-foreground [&_span]:text-xs [&_span]:text-muted-foreground">
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
                                    className={`flex min-h-14 cursor-pointer flex-col items-start gap-0.5 rounded-lg border bg-background px-3 py-2 text-left outline-none transition-colors hover:border-primary hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-dashed disabled:bg-transparent disabled:text-muted-foreground disabled:hover:border-border [&>small]:text-xs [&>small]:text-muted-foreground [&>strong]:text-sm [&>strong]:font-semibold [&>strong]:tabular-nums ${pickedFare ? 'border-primary bg-primary/5 ring-1 ring-primary' : ''}`}
                                    disabled={!!fare.unavailableReason}
                                    aria-pressed={pickedFare}
                                    onClick={() => pickFare(legIndex, flight, fare)}
                                  >
                                    <strong>
                                      {fare.unavailableReason ? 'Not available' : money(fare.pricePerPassenger, fare.currency)}
                                    </strong>
                                    <small className={fare.seatsLeft <= 4 ? '!text-warn' : undefined}>
                                      {fare.unavailableReason
                                        ? fare.unavailableReason
                                        : `${fare.seatsLeft > 9 ? '9+' : fare.seatsLeft} seats left`}
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
            <section
              className={`flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-sm sm:flex-row sm:items-center sm:justify-between [&_p:not(:first-child)]:mt-1 [&_p:not(:first-child)]:text-sm [&_p:not(:first-child)]:text-muted-foreground ${picked ? 'border-primary/50' : ''}`}
              aria-label="Selected itinerary"
            >
              <div>
                <p className="w-fit rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">Your trip</p>
                <strong>
                  {selected
                    .filter(Boolean)
                    .map((selection) => selection!.flight.flightNumber)
                    .join(' + ') || tripHint}
                </strong>
                {picked > 0 && <p>{partyLabel} · price per passenger shown</p>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 sm:flex-nowrap sm:justify-end [&>div]:flex [&>div]:flex-col [&>div]:items-start sm:[&>div]:items-end [&>div>span]:text-xs [&>div>span]:text-muted-foreground [&>div>strong]:text-xl [&>div>strong]:whitespace-nowrap [&>div>strong]:tabular-nums">
                <div>
                  <span>Total</span>
                  <strong>{money(total, tripCurrency)}</strong>
                </div>
                {onContinue && (
                  <button
                    className="inline-flex h-10 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm sm:h-9 sm:w-auto font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
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
          </div>
        )}
      </div>
    </PageShell>
  )
}
