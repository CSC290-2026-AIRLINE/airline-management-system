import type { SeatPickerProps } from '../components/contracts'
import type { Cabin } from '../api/types'
import './seat-picker.css'

type SeatPickerWithCabinProps = SeatPickerProps & { selectedCabin?: Cabin }

const legend = [
  { label: 'Available', style: 'available' },
  { label: 'Extra legroom', style: 'extra-legroom' },
  { label: 'Exit row', style: 'exit' },
  { label: 'Selected', style: 'selected' },
  { label: 'Held', style: 'held' },
  { label: 'Taken', style: 'taken' },
  { label: 'Blocked', style: 'blocked' },
]

export function SeatPicker({
  seats,
  selectedSeatCode,
  disabledSeatCodes = [],
  passengerLabel,
  selectedCabin,
  onSelect,
}: SeatPickerWithCabinProps) {
  const rows = [...new Set(seats.map((seat) => seat.row))].sort((a, b) => a - b)

  if (seats.length === 0) return <p>No seats are available to display.</p>

  return (
    <section className="seat-picker" aria-label={passengerLabel ? `Seats for ${passengerLabel}` : 'Choose a seat'}>
      {selectedCabin && <p className="seat-picker__cabin">Your cabin: {selectedCabin.replace('_', ' ')}</p>}
      <div className="seat-picker__legend" aria-label="Seat legend">
        {legend.map((item) => (
          <span className="seat-picker__legend-item" key={item.style}>
            <span aria-hidden="true" className={`seat-picker__swatch seat-picker__swatch--${item.style}`} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="seat-picker__rows">
        <div className="seat-picker__row seat-picker__columns" aria-hidden="true">
          <span className="seat-picker__number" />
          {seats
            .filter((seat) => seat.row === rows[0])
            .map((seat, index) => (
              <span className={`seat-picker__column${index === 3 ? ' seat-picker__seat--aisle' : ''}`} key={seat.column}>
                {seat.column}
              </span>
            ))}
        </div>
        {rows.map((row) => (
          <div className="seat-picker__row" key={row}>
            <span className="seat-picker__number">{row}</span>
            {seats
              .filter((seat) => seat.row === row)
              .map((seat, index) => {
                const selected = selectedSeatCode === seat.seatCode
                const disabled = seat.state !== 'available' || disabledSeatCodes.includes(seat.seatCode)
                const seatState = seat.state === 'available' && disabled ? 'unavailable' : seat.state
                const label = `${seat.seatCode}, ${seat.type.replace('_', ' ')}, ${seatState}${seat.fee > 0 ? `, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(seat.fee)}` : ''}`
                return (
                  <button
                    key={seat.seatCode}
                    type="button"
                    className={`seat-picker__seat seat-picker__seat--${seat.type} seat-picker__seat--${seatState}${index === 3 ? ' seat-picker__seat--aisle' : ''}${selectedCabin === seat.cabin ? ' seat-picker__seat--cabin' : ''}`}
                    disabled={disabled}
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => onSelect(seat.seatCode)}
                  >
                    <span>{seat.state === 'taken' || seat.state === 'blocked' ? '×' : seat.column}</span>
                    {seat.fee > 0 && (
                      <span className="seat-picker__fee" aria-hidden="true">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(seat.fee)}
                      </span>
                    )}
                  </button>
                )
              })}
            {seats.some((seat) => seat.row === row && seat.type === 'exit') && <span className="seat-picker__exit-label">Exit row</span>}
          </div>
        ))}
      </div>
    </section>
  )
}
