import { useState } from 'react'
import type { Cabin, SeatMap } from '../api/types'
import { SeatPicker } from './SeatPicker'
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
  passengers: SeatSelectionPassenger[]
  segments: SeatSelectionSegment[]
  initialSeats?: SelectedSeat[]
  onContinue: (seats: SelectedSeat[]) => void
  onBack: () => void
}

export function SeatSelection({ passengers, segments, initialSeats = [], onContinue, onBack }: SeatSelectionProps) {
  const eligible = passengers.filter((passenger) => passenger.type !== 'infant')
  const [passengerId, setPassengerId] = useState(eligible[0]?.id ?? '')
  const [flightId, setFlightId] = useState(segments[0]?.flightId ?? '')
  const [choices, setChoices] = useState<SelectedSeat[]>(initialSeats)
  const segment = segments.find((item) => item.flightId === flightId)
  const passenger = eligible.find((item) => item.id === passengerId)
  const selected = choices.find((item) => item.flightId === flightId && item.passengerId === passengerId)

  if (!segment || !passenger) return <p>No passengers or flights are available for seat selection.</p>

  function selectSeat(seatCode: string) {
    setChoices((previous) => [
      ...previous.filter((choice) => choice.flightId !== flightId || choice.passengerId !== passengerId),
      { flightId, passengerId, seatCode },
    ])
  }

  function skipSegment() {
    const remaining = choices.filter((choice) => choice.flightId !== flightId)
    setChoices(remaining)
    onContinue(remaining)
  }

  return (
    <section className="seat-selection">
      <h1>Choose your seats</h1>
      <div className="seat-selection__segments" aria-label="Flights">
        {segments.map((item) => (
          <button key={item.flightId} type="button" aria-pressed={item.flightId === flightId} onClick={() => setFlightId(item.flightId)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="seat-selection__layout">
        <SeatPicker
          seats={segment.seatMap.rows.flatMap((row) => row.seats)}
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
          onSelect={selectSeat}
        />
        <aside>
          <h2>Passengers</h2>
          {eligible.map((item) => {
            const choice = choices.find((seat) => seat.passengerId === item.id && seat.flightId === flightId)
            return (
              <button key={item.id} type="button" aria-pressed={item.id === passengerId} onClick={() => setPassengerId(item.id)}>
                {item.name} — {choice?.seatCode ?? 'No seat yet'}
              </button>
            )
          })}
          <p>Infants travel on an adult’s lap and do not need a seat.</p>
          <p>Exit-row seats are subject to eligibility rules.</p>
          <button type="button" onClick={() => onContinue(choices)}>
            Continue to review
          </button>
          <button type="button" onClick={skipSegment}>
            Skip, choose seats later
          </button>
          <button type="button" onClick={onBack}>
            Back
          </button>
        </aside>
      </div>
    </section>
  )
}
