import { useEffect, useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { SeatMap } from '../api/types'
import type { BookingSeatStepProps } from '../flow/integration'
import { SeatPicker } from './SeatPicker'
import './seat-selection.css'

export function BookingSeatStep({
  itinerary,
  travellers,
  choices,
  busy,
  error,
  onChange,
  onBack,
  onContinue,
  onSkip,
}: BookingSeatStepProps) {
  const { fetchWithAuth } = useAppAuth()
  const [maps, setMaps] = useState<Record<string, SeatMap> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [flightId, setFlightId] = useState(itinerary.selections[0]?.flight.flightId ?? '')
  const [travellerKey, setTravellerKey] = useState(travellers.find((person) => person.expectedType !== 'infant')?.key ?? '')

  // A failed hold can mean someone else took a seat; refresh when the flow reports an error.
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
  const traveller = travellers.find((person) => person.key === travellerKey && person.expectedType !== 'infant')
  const map = maps?.[flightId]
  const selected = choices.find((item) => item.flightId === flightId && item.travellerKey === travellerKey)
  const allSeats = map?.rows.flatMap((row) => row.seats) ?? []

  return (
    <section className="seat-selection" aria-label="Seat selection">
      {loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoadError(null)
              setRetry((n) => n + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : !maps ? (
        <p role="status">Loading seat maps…</p>
      ) : null}
      {error && <p role="alert">{error}</p>}
      {maps && selection && traveller && map && (
        <>
          <div className="seat-selection__segments" aria-label="Flights">
            {itinerary.selections.map(({ flight }) => (
              <button
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
          <div className="seat-selection__layout">
            <SeatPicker
              seats={allSeats}
              selectedCabin={selection.fare.cabin}
              selectedSeatCode={selected?.seatCode ?? null}
              passengerLabel={`${traveller.givenName} ${traveller.familyName}`}
              disabledSeatCodes={allSeats
                .filter(
                  (seat) =>
                    busy ||
                    seat.cabin !== selection.fare.cabin ||
                    choices.some(
                      (choice) => choice.flightId === flightId && choice.travellerKey !== travellerKey && choice.seatCode === seat.seatCode,
                    ),
                )
                .map((seat) => seat.seatCode)}
              onSelect={(seatCode) =>
                onChange([
                  ...choices.filter((choice) => choice.flightId !== flightId || choice.travellerKey !== travellerKey),
                  { flightId, travellerKey, seatCode },
                ])
              }
            />
            <aside>
              <h2>Passengers</h2>
              {travellers
                .filter((person) => person.expectedType !== 'infant')
                .map((person) => (
                  <button
                    key={person.key}
                    type="button"
                    disabled={busy}
                    aria-pressed={travellerKey === person.key}
                    onClick={() => setTravellerKey(person.key)}
                  >
                    {person.givenName} {person.familyName} —{' '}
                    {choices.find((choice) => choice.flightId === flightId && choice.travellerKey === person.key)?.seatCode ??
                      'No seat yet'}
                  </button>
                ))}
              <p>Infants travel on an adult’s lap. Exit-row seats have eligibility rules.</p>
              <button type="button" disabled={busy} onClick={() => onChange(choices.filter((choice) => choice.flightId !== flightId))}>
                Choose seats later for this flight
              </button>
            </aside>
          </div>
        </>
      )}
      {maps && (!selection || !traveller || !map) && <p>No seat map is available for this flight.</p>}
      <div className="seat-selection__segments">
        <button type="button" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button type="button" disabled={busy || !maps} onClick={onContinue}>
          {busy ? 'Creating booking…' : 'Continue to review'}
        </button>
        <button type="button" disabled={busy} onClick={onSkip}>
          Skip, choose seats later
        </button>
      </div>
    </section>
  )
}
