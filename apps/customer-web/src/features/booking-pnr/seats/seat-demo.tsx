import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { SeatDefinition, SeatMap } from '../api/types'
import type { AssistanceValue } from '../components/contracts'
import { AssistanceFields } from '../assistance/AssistanceFields'
import { AssistanceRequestDialog } from '../assistance/AssistanceRequestDialog'
import { AssistanceStatus } from '../assistance/AssistanceStatus'
import { SeatSelection, type SelectedSeat } from './SeatSelection'
import './seat-demo.css'

// Same Feature 9 layout and zero-fee Feature 4 behaviour as the agreed backend stubs.
const seats: SeatDefinition[] = Array.from({ length: 30 }, (_, index) => {
  const row = index + 1
  return ['A', 'B', 'C', 'D', 'E', 'F'].map((column): SeatDefinition => ({
    seatCode: `${row}${column}`,
    row,
    column,
    cabin: 'economy',
    type: row === 12 ? 'exit' : row <= 3 ? 'extra_legroom' : 'standard',
    state:
      row === 5 && ['B', 'C'].includes(column)
        ? 'taken'
        : row === 6 && column === 'D'
          ? 'held'
          : row === 7 && column === 'F'
            ? 'blocked'
            : 'available',
    fee: 0,
  }))
}).flat()
const map = (flightId: string): SeatMap => ({
  flightId,
  cabins: [{ cabin: 'economy', capacity: 180 }],
  rows: Array.from({ length: 30 }, (_, i) => ({ row: i + 1, seats: seats.filter((seat) => seat.row === i + 1) })),
})
const segments = [
  { flightId: 'outbound', label: 'FL203 · BKK → NRT', cabin: 'economy' as const, seatMap: map('outbound') },
  { flightId: 'return', label: 'FL204 · NRT → BKK', cabin: 'economy' as const, seatMap: map('return') },
]
const passengers = [
  { id: 'adult', name: 'Anya Saranpat', type: 'adult' as const },
  { id: 'child', name: 'Mali Saranpat', type: 'child' as const },
]

export function SeatDemo() {
  const [choices, setChoices] = useState<SelectedSeat[] | null>(null)
  const [assistance, setAssistance] = useState<AssistanceValue>({ serviceCode: null, note: '' })
  const [dialog, setDialog] = useState(false)
  const [requested, setRequested] = useState(false)
  return (
    <main className="seat-demo">
      <header className="seat-demo__brand">
        Flython <small>AIRLINES</small>
      </header>
      <p className="seat-demo__step">
        Flights — Passengers — <strong>Seats</strong> — Review &amp; pay
      </p>
      <SeatSelection
        passengers={passengers}
        segments={segments}
        onContinue={setChoices}
        onBack={() => document.getElementById('assistance-fields')?.scrollIntoView({ behavior: 'smooth' })}
      />
      {choices && (
        <section className="seat-demo__card" aria-label="Seat choices" role="status">
          <h2>Your seat choices</h2>
          {segments.map((segment) => (
            <div key={segment.flightId}>
              <h3>{segment.label}</h3>
              {passengers.map((person) => (
                <p key={person.id}>
                  {person.name}:{' '}
                  {choices.find((choice) => choice.flightId === segment.flightId && choice.passengerId === person.id)?.seatCode ??
                    'Choose later'}
                </p>
              ))}
            </div>
          ))}
        </section>
      )}
      <section className="seat-demo__card" id="assistance-fields">
        <h2>Special assistance</h2>
        <p>Anya Saranpat</p>
        <AssistanceFields value={assistance} onChange={setAssistance} />
        <button type="button" onClick={() => setDialog(true)}>
          Request assistance
        </button>
        {requested && (
          <p>
            Assistance request · <AssistanceStatus status="requested" />
          </p>
        )}
      </section>
      <AssistanceRequestDialog
        open={dialog}
        onClose={() => setDialog(false)}
        onSubmit={() => {
          setRequested(true)
          return Promise.resolve()
        }}
      />
    </main>
  )
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<SeatDemo />)
