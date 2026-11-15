import { useState } from 'react'
import { ApiError } from '../api/client'
import type { Cabin, SeatMap } from '../api/types'
import { SeatPicker } from './SeatPicker'
import { SeatTakenDialog } from './SeatTakenDialog'
import controls from '../styles/controls.module.css'
import { formatMoney } from '../lib/format'
import './seat-selection.css'

interface BookingSeatChangeProps {
  seatMap: SeatMap
  currency: string
  cabin: Cabin
  passengerName: string
  currentSeat: string | null
  onChangeSeat: (seatCode: string) => Promise<{ status: 'assigned' | 'payment_required'; lock?: { id: string } }>
  onPaySeat?: (lockId: string) => Promise<void>
  onRefresh: () => Promise<void>
  onClose: () => void
}

// Booking Detail supplies the authorized API callback after the seat-change route is connected.
export function BookingSeatChange({
  seatMap,
  currency,
  cabin,
  passengerName,
  currentSeat,
  onChangeSeat,
  onPaySeat,
  onRefresh,
  onClose,
}: BookingSeatChangeProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [paymentRequired, setPaymentRequired] = useState(false)
  const [paymentLock, setPaymentLock] = useState<string | null>(null)
  const [assigned, setAssigned] = useState(false)
  const [taken, setTaken] = useState(false)
  const seats = seatMap.rows.flatMap((row) => row.seats)
  const selectedSeat = seats.find((seat) => seat.seatCode === selected)

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
        setPaymentLock(result.lock?.id ?? null)
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
      <div className="booking-seat-panel__editor-heading">
        <div>
          <h3>Choose a seat for {passengerName}</h3>
          <p className="seat-selection__muted">Current seat: {currentSeat ?? 'Not chosen'} · Exit-row seats have eligibility rules.</p>
        </div>
        <button className={controls.secondary} type="button" disabled={saving} onClick={onClose}>
          Close
        </button>
      </div>
      <SeatTakenDialog open={taken} seatCode={selected} onClose={chooseAnother} onChooseAnother={chooseAnother} />
      <SeatPicker
        seats={seats}
        currency={currency}
        selectedCabin={cabin}
        selectedSeatCode={selected}
        currentSeatCode={currentSeat}
        passengerLabel={passengerName}
        disabledSeatCodes={seats
          .filter((seat) => seat.cabin !== cabin || saving || paymentRequired || assigned)
          .map((seat) => seat.seatCode)}
        onSelect={(seatCode) => {
          setSelected(seatCode)
          setMessage(null)
        }}
      />
      {selectedSeat && (
        <div className="seat-selection__selected" role="status">
          <span>
            <strong>Seat {selectedSeat.seatCode}</strong>
            <small>{selectedSeat.type.replaceAll('_', ' ')}</small>
          </span>
          <strong>{selectedSeat.fee ? formatMoney(selectedSeat.fee, currency) : 'Free'}</strong>
        </div>
      )}
      {selectedSeat?.type === 'exit' && (
        <p className="seat-selection__warning" role="status">
          Exit-row seats require an adult with no assistance request and no infant on their lap.
        </p>
      )}
      {message && (
        <p className="seat-selection__hint" role="status">
          {message}
        </p>
      )}
      <div className="booking-seat-panel__actions">
        {import.meta.env.DEV && paymentRequired && paymentLock && onPaySeat && (
          <button
            className={controls.primary}
            type="button"
            disabled={saving || assigned}
            onClick={() => {
              setSaving(true)
              void onPaySeat(paymentLock)
                .then(() => {
                  setAssigned(true)
                  setPaymentRequired(false)
                  setMessage(`Seat ${selected} has been assigned after payment.`)
                })
                .catch(() => setMessage('Payment could not be completed. The seat has not been assigned; close and try again.'))
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Confirming payment…' : 'Confirm seat payment (development)'}
          </button>
        )}
        <button
          className={controls.primary}
          type="button"
          disabled={!selected || saving || paymentRequired || assigned}
          onClick={() => void submit()}
        >
          {saving ? 'Saving…' : 'Confirm seat'}
        </button>
        <button className={controls.secondary} type="button" disabled={saving} onClick={onClose}>
          {assigned ? 'Done' : 'Cancel'}
        </button>
      </div>
    </section>
  )
}
