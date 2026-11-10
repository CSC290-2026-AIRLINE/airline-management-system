import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { SeatDefinition } from '../api/types'
import { SeatPicker } from './SeatPicker'
import './seat-demo.css'

const seats: SeatDefinition[] = Array.from({ length: 30 }, (_, index) => {
  const row = index + 1
  return ['A', 'B', 'C', 'D', 'E', 'F'].map((column): SeatDefinition => ({
    seatCode: `${row}${column}`,
    row,
    column,
    cabin: 'economy',
    type: row === 12 ? 'exit' : row <= 3 ? 'extra_legroom' : 'standard',
    state: row === 5 && ['B', 'C'].includes(column) ? 'taken' : 'available',
    fee: 0,
  }))
}).flat()

export function SeatDemo() {
  const [selected, setSelected] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  return (
    <main className="seat-demo">
      <p className="seat-demo__brand">Flython</p>
      <p className="seat-demo__step">
        Flights &nbsp;—&nbsp; Passengers &nbsp;—&nbsp; <strong>Seats</strong> &nbsp;—&nbsp; Review & pay
      </p>
      <h1>Choose your seats</h1>
      <p>Choose a seat or select one later.</p>
      <div className="seat-demo__layout">
        <div className="seat-demo__card">
          <SeatPicker
            seats={seats}
            selectedCabin="economy"
            selectedSeatCode={selected}
            passengerLabel="Passenger"
            onSelect={(seat) => {
              setSelected(seat)
              setSkipped(false)
            }}
          />
        </div>
        <aside className="seat-demo__card">
          <h2>Passenger</h2>
          <p aria-live="polite">{selected ? `Seat ${selected}` : skipped ? 'Choose later' : 'No seat yet'}</p>
          <p>Pick a seat, or choose later in My Trips or at check-in.</p>
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setSkipped(true)
            }}
          >
            Skip, choose seats later
          </button>
        </aside>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<SeatDemo />)
