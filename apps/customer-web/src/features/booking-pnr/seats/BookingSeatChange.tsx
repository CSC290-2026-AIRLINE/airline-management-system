import { useState } from 'react'
import { ApiError } from '../api/client'
import type { Cabin, SeatMap } from '../api/types'
import { SeatPicker } from './SeatPicker'
import { SeatTakenDialog } from './SeatTakenDialog'
import './seat-selection.css'

interface BookingSeatChangeProps {
  seatMap: SeatMap
  cabin: Cabin
  passengerName: string
  currentSeat: string | null
  onChangeSeat: (seatCode: string) => Promise<{ status: 'assigned' | 'payment_required' }>
  onRefresh: () => Promise<void>
  onClose: () => void
}

// Booking Detail supplies the authorized API callback after the seat-change route is connected.
export function BookingSeatChange({
  seatMap,
  cabin,
  passengerName,
  currentSeat,
  onChangeSeat,
  onRefresh,
  onClose,
}: BookingSeatChangeProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [paymentRequired, setPaymentRequired] = useState(false)
  const [assigned, setAssigned] = useState(false)
  const [taken, setTaken] = useState(false)
  const seats = seatMap.rows.flatMap((row) => row.seats)

  function chooseAnother() {
    setTaken(false)
    setSelected(null)
    setSaving(true)
    void onRefresh()
      .catch(() => setMessage('Could not refresh the seat map. Please close and try again.'))
      .finally(() => setSaving(false))
  }

  async function submit() {
    if (!selected || saving) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await onChangeSeat(selected)
      if (result.status === 'payment_required') {
        setPaymentRequired(true)
        setMessage('This seat is held temporarily. Payment is required before it is assigned.')
      } else {
        setAssigned(true)
        setMessage(`Seat ${selected} has been assigned.`)
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SEAT_UNAVAILABLE') setTaken(true)
      else if (error instanceof ApiError && error.code === 'BOOKING_CLOSED') {
        setMessage('Your seat can no longer be changed here. Please contact the airline for help.')
      } else if (error instanceof ApiError && error.code === 'SEAT_NOT_ALLOWED') {
        setMessage('This seat is not available for this passenger. Please choose another seat.')
      } else setMessage('Could not change your seat. Refresh the seat map and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="seat-selection" aria-label="Change your seat">
      <h2>Choose a seat for {passengerName}</h2>
      <p>Current seat: {currentSeat ?? 'Not chosen'}</p>
      <p>Exit-row seats are subject to eligibility rules.</p>
      <SeatTakenDialog open={taken} seatCode={selected} onClose={chooseAnother} onChooseAnother={chooseAnother} />
      <SeatPicker
        seats={seats}
        selectedCabin={cabin}
        selectedSeatCode={selected}
        passengerLabel={passengerName}
        disabledSeatCodes={seats
          .filter((seat) => seat.cabin !== cabin || saving || paymentRequired || assigned)
          .map((seat) => seat.seatCode)}
        onSelect={(seatCode) => {
          setSelected(seatCode)
          setMessage(null)
        }}
      />
      {message && <p role="status">{message}</p>}
      <div className="seat-selection__segments">
        <button type="button" disabled={!selected || saving || paymentRequired || assigned} onClick={() => void submit()}>
          {saving ? 'Saving…' : 'Confirm seat'}
        </button>
        <button type="button" disabled={saving} onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  )
}
