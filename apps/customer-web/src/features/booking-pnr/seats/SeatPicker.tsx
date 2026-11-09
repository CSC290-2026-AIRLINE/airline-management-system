import type { SeatPickerProps } from '../components/contracts'
import './seat-picker.css'

export function SeatPicker({ seats, selectedSeatCode, disabledSeatCodes = [], passengerLabel, onSelect }: SeatPickerProps) {
  const rows = [...new Set(seats.map((seat) => seat.row))].sort((a, b) => a - b)

  if (seats.length === 0) return <p>No seats are available to display.</p>

  return (
    <section className="seat-picker" aria-label={passengerLabel ? `Seats for ${passengerLabel}` : 'Choose a seat'}>
      <div className="seat-picker__legend" aria-label="Seat legend">
        <span>Available</span>
        <span>Extra legroom</span>
        <span>Exit row</span>
        <span>Selected</span>
        <span>Unavailable</span>
      </div>
      <div className="seat-picker__rows">
        {rows.map((row) => (
          <div className="seat-picker__row" key={row}>
            <span className="seat-picker__number">{row}</span>
            {seats
              .filter((seat) => seat.row === row)
              .map((seat, index) => {
                const selected = selectedSeatCode === seat.seatCode
                const disabled = seat.state !== 'available' || disabledSeatCodes.includes(seat.seatCode)
                const label = `${seat.seatCode}, ${seat.type.replace('_', ' ')}, ${disabled ? 'unavailable' : 'available'}${seat.fee > 0 ? `, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(seat.fee)}` : ''}`
                return (
                  <button
                    key={seat.seatCode}
                    type="button"
                    className={`seat-picker__seat seat-picker__seat--${seat.type}${index === 3 ? ' seat-picker__seat--aisle' : ''}`}
                    disabled={disabled}
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => onSelect(seat.seatCode)}
                  >
                    {seat.column}
                  </button>
                )
              })}
          </div>
        ))}
      </div>
    </section>
  )
}
