import { ArrowUp, Check } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { SeatPickerProps } from '../components/contracts'
import type { Cabin } from '../api/types'
import { formatCabin, formatMoney } from '../lib/format'
import './seat-picker.css'

type SeatPickerWithCabinProps = SeatPickerProps & { selectedCabin?: Cabin; bookingLegend?: boolean; legendAction?: ReactNode }

export function SeatPicker({
  seats,
  currency,
  selectedSeatCode,
  disabledSeatCodes = [],
  passengerLabel,
  seatLabels = {},
  currentSeatCode,
  selectedCabin,
  bookingLegend = false,
  legendAction,
  onSelect,
}: SeatPickerWithCabinProps) {
  const visibleSeats = selectedCabin ? seats.filter((seat) => seat.cabin === selectedCabin) : seats
  const rows = [...new Set(visibleSeats.map((seat) => seat.row))].sort((a, b) => a - b)
  const columns = [...new Set(visibleSeats.map((seat) => seat.column))].sort()
  const layoutHasAisles = visibleSeats.some((seat) => seat.aisleBefore !== undefined)
  const aisleColumns = new Set(visibleSeats.filter((seat) => seat.aisleBefore).map((seat) => seat.column))
  const mapRegion = useRef<HTMLDivElement>(null)
  const cabinRow = useRef<HTMLDivElement>(null)
  const firstCabinRow = rows[0]
  useEffect(() => {
    if (mapRegion.current && cabinRow.current) mapRegion.current.scrollTop = Math.max(0, cabinRow.current.offsetTop - 48)
  }, [firstCabinRow, selectedCabin])
  const extraFees = [...new Set(visibleSeats.filter((seat) => seat.type === 'extra_legroom').map((seat) => seat.fee))]
  const extraPrice = extraFees.length ? `${extraFees.length > 1 ? 'from ' : ''}${formatMoney(Math.min(...extraFees), currency)}` : null
  const standardFees = visibleSeats.filter((seat) => seat.type === 'standard').map((seat) => seat.fee)
  const standardPrice =
    standardFees.length && standardFees.some((fee) => fee > 0)
      ? `Standard · ${new Set(standardFees).size > 1 ? 'from ' : ''}${formatMoney(Math.min(...standardFees), currency)}`
      : 'Free'
  const initials = passengerLabel?.trim().charAt(0).toUpperCase() ?? ''
  const fullLegend = [
    { label: standardPrice, style: 'available' },
    { label: `Extra legroom${extraPrice ? ` · ${extraPrice}` : ''}`, style: 'extra-legroom' },
    { label: 'Exit row', style: 'exit' },
    { label: 'Yours', style: 'selected' },
    { label: 'Held', style: 'held' },
    { label: 'Taken', style: 'taken' },
    { label: 'Blocked', style: 'blocked' },
  ]
  const legend = bookingLegend
    ? [
        { label: standardPrice, style: 'available' },
        { label: `Extra legroom${extraPrice ? ` · ${extraPrice}` : ''}`, style: 'extra-legroom' },
        { label: 'Yours', style: 'selected' },
        { label: 'Taken', style: 'taken' },
      ]
    : fullLegend
  if (!visibleSeats.length) return <p role="status">No seats are available to display in this cabin.</p>

  return (
    <section
      className={`seat-picker${bookingLegend ? ' seat-picker--booking' : ''}`}
      aria-label={passengerLabel ? `Seats for ${passengerLabel}` : 'Choose a seat'}
    >
      <div className="seat-picker__legend" aria-label="Seat legend">
        {legend.map((item) => (
          <span className="seat-picker__legend-item" key={item.style}>
            <span aria-hidden="true" className={`seat-picker__swatch seat-picker__swatch--${item.style}`}>
              {item.style === 'extra-legroom' ? <ArrowUp /> : item.style === 'taken' ? '×' : null}
            </span>
            {item.label}
          </span>
        ))}
        {legendAction}
      </div>
      {selectedCabin && !bookingLegend && (
        <p className="seat-picker__cabin">{formatCabin(selectedCabin)} · Choose a seat to see its price</p>
      )}
      <div ref={mapRegion} className="seat-picker__rows" tabIndex={0} role="region" aria-label="Aircraft seat map, scroll to see all rows">
        <div className="seat-picker__row seat-picker__columns" aria-hidden="true">
          <span className="seat-picker__number" />
          {columns.map((column, index) => (
            <span
              className={`seat-picker__column${(layoutHasAisles ? aisleColumns.has(column) : index === Math.ceil(columns.length / 2)) ? ' seat-picker__seat--aisle' : ''}`}
              key={column}
            >
              {column}
            </span>
          ))}
          <span className="seat-picker__row-note" />
        </div>
        {rows.map((row) => {
          const rowSeats = visibleSeats.filter((seat) => seat.row === row)
          return (
            <div className="seat-picker__row" key={row} ref={row === firstCabinRow ? cabinRow : undefined}>
              <span className="seat-picker__number" aria-hidden="true">
                {row}
              </span>
              {columns.map((column, index) => {
                const seat = rowSeats.find((item) => item.column === column)
                const startsAisle =
                  seat?.aisleBefore ?? (layoutHasAisles ? aisleColumns.has(column) : index === Math.ceil(columns.length / 2))
                const aisleClass = startsAisle ? ' seat-picker__seat--aisle' : ''
                if (!seat) return <span key={column} className={`seat-picker__gap${aisleClass}`} aria-hidden="true" />
                const selected = selectedSeatCode === seat.seatCode
                const current = currentSeatCode === seat.seatCode
                const partyLabel = seatLabels[seat.seatCode]
                const disabled = current || seat.state !== 'available' || disabledSeatCodes.includes(seat.seatCode)
                const state = seat.state === 'available' && disabled ? 'unavailable' : seat.state
                const displayState = bookingLegend && (state === 'held' || state === 'blocked') ? 'taken' : state
                const price = seat.fee > 0 ? formatMoney(seat.fee, currency) : 'Free'
                const label = `${seat.seatCode}, ${formatCabin(seat.cabin)}, ${seat.type.replaceAll('_', ' ')}, ${current ? 'current seat' : partyLabel ? `chosen for ${partyLabel}` : state}, ${price}`
                return (
                  <button
                    key={seat.seatCode}
                    type="button"
                    className={`seat-picker__seat seat-picker__seat--${seat.type} seat-picker__seat--${displayState}${aisleClass}${partyLabel ? ' seat-picker__seat--party' : ''}${current ? ' seat-picker__seat--current' : ''}`}
                    disabled={disabled}
                    aria-label={label}
                    title={label}
                    aria-pressed={selected}
                    onClick={() => onSelect(seat.seatCode)}
                  >
                    <span className="seat-picker__glyph" aria-hidden="true">
                      {selected ? (
                        initials || <Check />
                      ) : current ? (
                        <Check />
                      ) : partyLabel ? (
                        partyLabel.trim().charAt(0).toUpperCase()
                      ) : seat.state === 'taken' || seat.state === 'blocked' || (bookingLegend && seat.state === 'held') ? (
                        '×'
                      ) : seat.type === 'extra_legroom' ? (
                        <ArrowUp />
                      ) : bookingLegend ? null : (
                        seat.column
                      )}
                    </span>
                  </button>
                )
              })}
              <span className="seat-picker__row-note">{!bookingLegend && rowSeats.some((seat) => seat.type === 'exit') ? 'Exit' : ''}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
