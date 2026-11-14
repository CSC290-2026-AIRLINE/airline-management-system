import { useState } from 'react'
import type { Cabin, SeatMap } from '../api/types'
import { formatMoney } from '../lib/format'
import { SeatPicker } from './SeatPicker'
import controls from '../styles/controls.module.css'
import './seat-selection.css'

export interface SeatSelectionPassenger {
  id: string
  name: string
  type: 'adult' | 'child' | 'infant'
}

export interface SeatSelectionSegment {
  flightId: string
  label: string
  cabin: Cabin
  seatMap: SeatMap
}

export interface SelectedSeat {
  passengerId: string
  flightId: string
  seatCode: string
}

interface SeatSelectionProps {
  currency: string
  passengers: SeatSelectionPassenger[]
  segments: SeatSelectionSegment[]
  initialSeats?: SelectedSeat[]
  onContinue: (seats: SelectedSeat[]) => void
  onBack: () => void
}

export function SeatSelection({ currency, passengers, segments, initialSeats = [], onContinue, onBack }: SeatSelectionProps) {
  const eligible = passengers.filter((passenger) => passenger.type !== 'infant')
  const [passengerId, setPassengerId] = useState(eligible[0]?.id ?? '')
  const [flightId, setFlightId] = useState(segments[0]?.flightId ?? '')
  const [choices, setChoices] = useState<SelectedSeat[]>(initialSeats)
  const segment = segments.find((item) => item.flightId === flightId)
  const passenger = eligible.find((item) => item.id === passengerId)
  const selected = choices.find((item) => item.flightId === flightId && item.passengerId === passengerId)
  const fee = choices
    .filter((choice) => choice.flightId === flightId)
    .reduce((total, choice) => {
      const flight = segments.find((item) => item.flightId === choice.flightId)
      return total + (flight?.seatMap.rows.flatMap((row) => row.seats).find((seat) => seat.seatCode === choice.seatCode)?.fee ?? 0)
    }, 0)
  const exitSelected = segment?.seatMap.rows
    .flatMap((row) => row.seats)
    .some((seat) => seat.seatCode === selected?.seatCode && seat.type === 'exit')

  if (!segment || !passenger) return <p>No passengers or flights are available for seat selection.</p>

  function selectSeat(seatCode: string) {
    setChoices((previous) => [
      ...previous.filter((choice) => choice.flightId !== flightId || choice.passengerId !== passengerId),
      { flightId, passengerId, seatCode },
    ])
  }

  function skipSegment() {
    setChoices((previous) => previous.filter((choice) => choice.flightId !== flightId))
  }

  return (
    <section className="seat-selection">
      <h1>Choose your seats</h1>
      <div className="seat-selection__layout">
        <div className="seat-selection__map-card">
          <div className="seat-selection__segments" aria-label="Flights">
            {segments.map((item) => (
              <button
                className={controls.secondary}
                key={item.flightId}
                type="button"
                aria-pressed={item.flightId === flightId}
                onClick={() => setFlightId(item.flightId)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SeatPicker
            seats={segment.seatMap.rows.flatMap((row) => row.seats)}
            currency={currency}
            bookingLegend
            selectedSeatCode={selected?.seatCode ?? null}
            selectedCabin={segment.cabin}
            disabledSeatCodes={[
              ...choices
                .filter((choice) => choice.flightId === flightId && choice.passengerId !== passengerId)
                .map((choice) => choice.seatCode),
              ...segment.seatMap.rows
                .flatMap((row) => row.seats)
                .filter((seat) => seat.cabin !== segment.cabin)
                .map((seat) => seat.seatCode),
            ]}
            passengerLabel={passenger.name}
            seatLabels={Object.fromEntries(
              choices
                .filter((choice) => choice.flightId === flightId)
                .map((choice) => [choice.seatCode, passengers.find((person) => person.id === choice.passengerId)?.name ?? 'Passenger']),
            )}
            onSelect={selectSeat}
          />
        </div>
        <aside className="seat-selection__summary">
          <div className="seat-selection__summary-section">
            <h2>Passengers on {segment.label.split(' · ')[0]}</h2>
            <div className="seat-selection__passengers">
              {eligible.map((item) => {
                const choice = choices.find((seat) => seat.passengerId === item.id && seat.flightId === flightId)
                return (
                  <button
                    className="seat-selection__passenger"
                    key={item.id}
                    type="button"
                    aria-pressed={item.id === passengerId}
                    onClick={() => setPassengerId(item.id)}
                  >
                    <span>
                      <strong>
                        {item.name} ({item.type})
                      </strong>
                    </span>
                    <span className="seat-selection__seat-code">{choice?.seatCode ?? 'No seat yet'}</span>
                  </button>
                )
              })}
            </div>
            {passengers.some((person) => person.type === 'infant') && (
              <p className="seat-selection__muted">Infants travel on an adult’s lap and do not need a seat.</p>
            )}
            <p className="seat-selection__fees">
              Seat fees <strong>{formatMoney(fee, currency)}</strong>
            </p>
            {exitSelected && (
              <p className="seat-selection__warning" role="status">
                Exit-row seats require an adult with no assistance request and no infant on their lap.
              </p>
            )}
            <p className="seat-selection__hint">
              Pick a passenger, then a seat. You can skip any flight and choose later in My Trips or at check-in. Seats are held when you
              continue to review.
            </p>
            <div className="seat-selection__actions">
              <button className={controls.primary} type="button" onClick={() => onContinue(choices)}>
                Continue to review
              </button>
              <button className={controls.secondary} type="button" onClick={skipSegment}>
                Choose seats later for this flight
              </button>
              <button className={controls.secondary} type="button" onClick={onBack}>
                Back
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
