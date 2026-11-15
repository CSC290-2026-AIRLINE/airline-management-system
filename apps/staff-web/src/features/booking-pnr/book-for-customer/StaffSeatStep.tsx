import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { SearchItinerary } from '@customer-web/features/booking-search/pages/FlightSearchPage'
import type { SeatChoice } from '@customer-web/features/booking-pnr/flow/integration'
import type { TravellerDraft } from '@customer-web/features/booking-pnr/flow/draft'
import { SeatPicker } from '@customer-web/features/booking-pnr/seats/SeatPicker'
import { useSeatQuote } from '@customer-web/features/booking-pnr/seats/useSeatQuote'
import type { SeatMap } from '../api/types'
import { lookupMoney as money } from '../booking-lookup/lookup-utils'
import '@customer-web/features/booking-pnr/seats/seat-selection.css'
import './staff-seat-step.css'

interface StaffSeatStepProps {
  itinerary: SearchItinerary
  currency: string
  travellers: TravellerDraft[]
  /** The seats chosen so far, one per traveller and flight. */
  choices: SeatChoice[]
  busy: boolean
  /** The error of the page, so a failed hold is reported here. */
  error: string | null
  promoCode?: string
  onChange: (choices: SeatChoice[]) => void
  onBack: () => void
  /** Creates the hold with the chosen seats and the price they add up to. */
  onContinue: (expectedTotal: number) => void
  /** Creates the hold without any seats. */
  onSkip: (expectedTotal: number) => void
}

/**
 * The seat step of the staff booking flow.
 *
 * The staff member picks a traveller, then a seat, on the same seat map the customer uses. The seats are only held
 * when the booking is held, so the step always ends with an explicit choice: hold the booking with these seats, or
 * hold it without any.
 */
export function StaffSeatStep({
  itinerary,
  currency,
  travellers,
  choices,
  busy,
  error,
  promoCode,
  onChange,
  onBack,
  onContinue,
  onSkip,
}: StaffSeatStepProps) {
  const { fetchWithAuth } = useAppAuth()
  const [maps, setMaps] = useState<Record<string, SeatMap> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [flightId, setFlightId] = useState(itinerary.selections[0]?.flight.flightId ?? '')
  const [travellerKey, setTravellerKey] = useState(travellers.find((person) => person.expectedType !== 'infant')?.key ?? '')
  const [skipping, setSkipping] = useState(false)
  const [skipError, setSkipError] = useState<string | null>(null)
  const quote = useSeatQuote(fetchWithAuth, itinerary, travellers, choices, maps, promoCode)

  // A failed hold can mean that someone else took a seat, so the map is fetched again when the page reports an error.
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const results = await Promise.all(
          itinerary.selections.map(async ({ flight }) => {
            const response = await fetchWithAuth(`/api/flights/${encodeURIComponent(flight.flightId)}/seat-map`, {
              signal: controller.signal,
            })
            if (!response.ok) throw new Error('Seat map unavailable')
            return [flight.flightId, (await response.json()) as SeatMap] as const
          }),
        )
        if (!controller.signal.aborted) {
          setMaps(Object.fromEntries(results))
          setLoadError(null)
        }
      } catch {
        if (!controller.signal.aborted) {
          setMaps(null)
          setLoadError('We could not load the seat map. Please try again.')
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [fetchWithAuth, itinerary.selections, retry, error])

  const selection = itinerary.selections.find((item) => item.flight.flightId === flightId)
  /* The chosen traveller may be gone after the party changed, so the first traveller with a seat is used instead. */
  const activeTravellerKey = travellers.some((person) => person.key === travellerKey && person.expectedType !== 'infant')
    ? travellerKey
    : (travellers.find((person) => person.expectedType !== 'infant')?.key ?? '')
  const traveller = travellers.find((person) => person.key === activeTravellerKey && person.expectedType !== 'infant')
  const map = maps?.[flightId]
  const missingCabin =
    maps &&
    itinerary.selections.some(
      ({ flight, fare }) => !maps[flight.flightId]?.cabins.some((cabin) => cabin.cabin === fare.cabin && cabin.capacity > 0),
    )
  const selected = choices.find((item) => item.flightId === flightId && item.travellerKey === activeTravellerKey)
  const allSeats = map?.rows.flatMap((row) => row.seats) ?? []
  /** The fees of every chosen seat, over every flight. */
  const seatFees = choices.reduce(
    (total, choice) =>
      total + (maps?.[choice.flightId]?.rows.flatMap((row) => row.seats).find((seat) => seat.seatCode === choice.seatCode)?.fee ?? 0),
    0,
  )
  const selectedSeat = allSeats.find((seat) => seat.seatCode === selected?.seatCode)
  const unavailableChoices = maps
    ? choices.filter((choice) => {
        const seat = maps[choice.flightId]?.rows.flatMap((row) => row.seats).find((item) => item.seatCode === choice.seatCode)
        return !seat || seat.state !== 'available'
      })
    : []
  const seatLabels = Object.fromEntries(
    choices
      .filter((choice) => choice.flightId === flightId)
      .map((choice) => {
        const person = travellers.find((item) => item.key === choice.travellerKey)
        return [choice.seatCode, person ? `${person.givenName} ${person.familyName}` : 'Passenger']
      }),
  )
  const exitSelected = selectedSeat?.type === 'exit'

  /** The hold is created without any seats, so the price is the price of the fare alone. */
  async function holdWithoutSeats() {
    setSkipping(true)
    setSkipError(null)
    try {
      onSkip(await quote.forChoices([]))
    } catch (cause: unknown) {
      setSkipError(cause instanceof Error ? cause.message : 'Could not update the price. Please try again.')
    } finally {
      setSkipping(false)
    }
  }

  return (
    <section className="seat-selection f3-staff-seat" aria-label="Seat selection" aria-busy={busy}>
      {error && (
        <p className="seat-selection__error" role="alert">
          {error}
        </p>
      )}
      {missingCabin && (
        <p className="seat-selection__error" role="alert">
          A selected cabin is not available on the assigned aircraft. Go back to flights and choose another cabin.
        </p>
      )}
      {unavailableChoices.length > 0 && (
        <div className="seat-selection__warning" role="alert">
          <p>
            Some chosen seats are no longer available: {unavailableChoices.map((choice) => choice.seatCode).join(', ')}. Clear them or
            choose replacement seats.
          </p>
          <button
            className="f3-search-secondary"
            type="button"
            disabled={busy}
            onClick={() => onChange(choices.filter((choice) => !unavailableChoices.includes(choice)))}
          >
            Clear unavailable seats
          </button>
        </div>
      )}
      <div className="seat-selection__layout">
        <div className="seat-selection__map-card">
          <div className="seat-selection__segments" aria-label="Flights">
            {itinerary.selections.map(({ flight }) => (
              <button
                className="f3-search-secondary"
                key={flight.flightId}
                type="button"
                disabled={busy}
                aria-pressed={flightId === flight.flightId}
                onClick={() => setFlightId(flight.flightId)}
              >
                {flight.flightNumber} · {flight.origin} → {flight.destination}
              </button>
            ))}
          </div>
          {loadError ? (
            <div className="seat-selection__error" role="alert">
              <p>{loadError}</p>
              <div className="f3-staff-seat__retry">
                <button
                  className="f3-search-secondary"
                  type="button"
                  onClick={() => {
                    setLoadError(null)
                    setRetry((count) => count + 1)
                  }}
                >
                  Try again
                </button>
                <button className="f3-search-secondary" type="button" disabled={busy || skipping} onClick={() => void holdWithoutSeats()}>
                  Hold without seats
                </button>
              </div>
            </div>
          ) : !maps ? (
            <p className="seat-selection__loading" role="status">
              Loading seat maps…
            </p>
          ) : null}
          {maps && !selection && <p role="status">No seat map is available for this flight.</p>}
          {maps && selection && !traveller && <p role="status">Choose a passenger to pick a seat.</p>}
          {maps && selection && traveller && !map && <p role="status">No seat map is available for this flight.</p>}
          {maps && selection && traveller && map && (
            <SeatPicker
              seats={allSeats}
              currency={currency}
              bookingLegend
              selectedCabin={selection.fare.cabin}
              selectedSeatCode={selected?.seatCode ?? null}
              seatLabels={seatLabels}
              passengerLabel={`${traveller.givenName} ${traveller.familyName}`}
              legendAction={
                choices.some((choice) => choice.flightId === flightId) ? (
                  <button
                    className="seat-picker__legend-action seat-selection__clear"
                    type="button"
                    disabled={busy}
                    aria-label="Clear seats for this flight"
                    onClick={() => onChange(choices.filter((choice) => choice.flightId !== flightId))}
                  >
                    <X aria-hidden="true" size={14} strokeWidth={2} />
                    Clear seats
                  </button>
                ) : null
              }
              disabledSeatCodes={allSeats
                .filter(
                  (seat) =>
                    busy ||
                    seat.cabin !== selection.fare.cabin ||
                    choices.some(
                      (choice) =>
                        choice.flightId === flightId && choice.travellerKey !== activeTravellerKey && choice.seatCode === seat.seatCode,
                    ),
                )
                .map((seat) => seat.seatCode)}
              onSelect={(seatCode) => {
                const remaining = choices.filter((choice) => choice.flightId !== flightId || choice.travellerKey !== activeTravellerKey)
                // Clicking the seat that is already chosen for this traveller removes the choice.
                onChange(
                  selected?.seatCode === seatCode ? remaining : [...remaining, { flightId, travellerKey: activeTravellerKey, seatCode }],
                )
              }}
            />
          )}
        </div>
        <aside className="seat-selection__summary" aria-label="Passengers and trip summary">
          <div className="seat-selection__summary-section">
            <h2>Passengers on {selection?.flight.flightNumber ?? 'this flight'}</h2>
            <div className="seat-selection__passengers" aria-label="Choose a passenger">
              {travellers
                .filter((person) => person.expectedType !== 'infant')
                .map((person) => {
                  const seat = choices.find((choice) => choice.flightId === flightId && choice.travellerKey === person.key)
                  return (
                    <button
                      className="seat-selection__passenger"
                      key={person.key}
                      type="button"
                      disabled={busy}
                      aria-pressed={activeTravellerKey === person.key}
                      onClick={() => setTravellerKey(person.key)}
                    >
                      <span>
                        <strong>
                          {person.givenName} {person.familyName} ({person.expectedType})
                        </strong>
                      </span>
                      <span className="seat-selection__seat-code">{seat?.seatCode ?? 'No seat yet'}</span>
                    </button>
                  )
                })}
            </div>
            {travellers.some((person) => person.expectedType === 'infant') && (
              <p className="seat-selection__muted">Infants travel on an adult’s lap and do not need a seat.</p>
            )}
            {exitSelected && (
              <p className="seat-selection__warning" role="status">
                Exit-row seats require an adult with no assistance request and no infant on their lap.
              </p>
            )}
            <p className="seat-selection__fees">
              <span>Seat fees</span>
              <strong>{maps ? money(seatFees, currency) : '—'}</strong>
            </p>
            <p className="seat-selection__fees f3-staff-seat__total">
              <span>Total with seats</span>
              <strong>{quote.total === null ? '—' : money(quote.total, currency)}</strong>
            </p>
            {quote.error && (
              <div className="seat-selection__error" role="alert">
                <p>{quote.error}</p>
                <button className="f3-search-secondary" type="button" disabled={busy || skipping} onClick={quote.retry}>
                  Retry price
                </button>
              </div>
            )}
            {skipError && (
              <p className="seat-selection__error" role="alert">
                {skipError}
              </p>
            )}
            <p className="seat-selection__hint">
              Pick a passenger, then a seat. Click the seat again to remove it. The seats are held for 15 minutes together with the booking.
            </p>
            <div className="seat-selection__actions">
              <button
                className="f3-search-primary"
                type="button"
                disabled={busy || skipping || quote.loading || quote.total === null || !!missingCabin || unavailableChoices.length > 0}
                onClick={() => {
                  if (quote.total === null) return
                  onContinue(quote.total)
                }}
              >
                {busy ? 'Creating booking…' : choices.length ? 'Create hold with seats' : 'Create hold'}
              </button>
              {choices.length > 0 && (
                <button className="f3-search-secondary" type="button" disabled={busy || skipping} onClick={() => void holdWithoutSeats()}>
                  {skipping ? 'Checking price…' : 'Create hold without seats'}
                </button>
              )}
              <button className="f3-search-secondary" type="button" disabled={busy || skipping} onClick={onBack}>
                Back to passengers
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
