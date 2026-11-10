import type { FormEvent, ReactNode } from 'react'
import type { FlightSearchFormProps } from './contracts'
import type { FlightSearchLeg, TripType } from '../api/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { AIRPORTS } from './airports'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function FlightSearchForm({ value, onChange, onSubmit, isLoading, errorMessage }: FlightSearchFormProps) {
  function setLeg(index: number, change: Partial<FlightSearchLeg>) {
    const legs = value.legs.map((leg, position) => (position === index ? { ...leg, ...change } : leg))
    if (value.tripType === 'return' && legs[1]) legs[1] = { ...legs[1], origin: legs[0].destination, destination: legs[0].origin }
    onChange({ ...value, legs })
  }
  function setTrip(tripType: TripType) {
    const first = value.legs[0]
    const second = value.legs[1] ?? { origin: first.destination, destination: first.origin, date: '' }
    const legs =
      tripType === 'one_way'
        ? [first]
        : tripType === 'return'
          ? [first, { ...second, origin: first.destination, destination: first.origin }]
          : [first, second]
    onChange({ ...value, tripType, legs })
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(value)
  }
  function airportSelect(leg: FlightSearchLeg, index: number, field: 'origin' | 'destination', label: string) {
    return (
      <label key={`${index}-${field}`}>
        {label}
        <Select value={leg[field]} onValueChange={(value) => setLeg(index, { [field]: value })}>
          <SelectTrigger aria-label={field === 'origin' ? `Leg ${index + 1} origin` : `Leg ${index + 1} destination`}>
            <SelectValue />
          </SelectTrigger>
          {/* The "From" dropdown opts into the staff console's smoother open/close animation. */}
          <SelectContent className={field === 'origin' ? 'cw-select-content--smooth' : undefined}>
            <SelectItem value="">Select airport</SelectItem>
            {AIRPORTS.map((airport) => (
              <SelectItem key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    )
  }
  function dateField(leg: FlightSearchLeg, index: number, label: string, ariaLabel: string, min: string) {
    return (
      <label key={`${index}-date`}>
        {label}
        <input
          aria-label={ariaLabel}
          type="date"
          required
          min={min}
          value={leg.date}
          onChange={(event) => setLeg(index, { date: event.target.value })}
        />
      </label>
    )
  }
  const labels: Array<[TripType, string]> = [
    ['one_way', 'One-way'],
    ['return', 'Return'],
    ['multi_city', 'Multi-city'],
  ]
  const lastLeg = value.legs.length - 1
  const rows: ReactNode[] = []
  if (value.tripType === 'return') {
    const outbound = value.legs[0]
    const inbound = value.legs[1] ?? { origin: '', destination: '', date: '' }
    rows.push(
      <div className="f3-search-leg-row" key="return">
        {airportSelect(outbound, 0, 'origin', 'From')}
        {airportSelect(outbound, 0, 'destination', 'To')}
        {dateField(outbound, 0, 'Depart', 'Leg 1 departure date', today())}
        {dateField(inbound, 1, 'Return', 'Return date', outbound.date || today())}
      </div>,
    )
  } else {
    value.legs.forEach((leg, index) => {
      rows.push(
        <div className="f3-search-leg-row" key={index}>
          {airportSelect(leg, index, 'origin', index > 0 ? `Leg ${index + 1} · From` : 'From')}
          {airportSelect(leg, index, 'destination', 'To')}
          {dateField(leg, index, 'Depart', `Leg ${index + 1} departure date`, index > 0 ? value.legs[index - 1].date || today() : today())}
          {value.tripType === 'multi_city' && index === lastLeg && (
            <div className="f3-search-leg-actions">
              {value.legs.length > 2 && (
                <button
                  className="f3-search-remove"
                  type="button"
                  aria-label={`Remove leg ${index + 1}`}
                  onClick={() => onChange({ ...value, legs: value.legs.filter((_, position) => position !== index) })}
                >
                  Remove leg {index + 1}
                </button>
              )}
              {value.legs.length < 5 && (
                <button
                  className="f3-search-secondary"
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      legs: [...value.legs, { origin: value.legs.at(-1)!.destination, destination: '', date: '' }],
                    })
                  }
                >
                  + Add another leg (up to 5)
                </button>
              )}
            </div>
          )}
        </div>,
      )
    })
  }
  return (
    <form className={`f3-search-card f3-search-form is-${value.tripType}`} onSubmit={submit} aria-label="Flight search">
      <div className="f3-search-tabs" role="group" aria-label="Trip type">
        {labels.map(([type, label]) => (
          <button type="button" key={type} aria-pressed={value.tripType === type} onClick={() => setTrip(type)}>
            {label}
          </button>
        ))}
      </div>
      <div className="f3-search-route-fields">{rows}</div>
      <div className="f3-search-party-row">
        <div className="f3-search-party">
          {(
            [
              ['adults', 'Adults (12+)'],
              ['children', 'Children (2–11)'],
              ['infants', 'Infants (under 2)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={0}
                max={key === 'infants' ? value.adults : 9 - value[key === 'adults' ? 'children' : 'adults']}
                step={1}
                required
                value={value[key]}
                onChange={(event) => onChange({ ...value, [key]: event.target.value === '' ? 0 : Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
        <button className="f3-search-primary" disabled={isLoading} type="submit">
          {isLoading ? 'Searching…' : 'Search flights'}
        </button>
      </div>
      <p className="f3-search-hint">
        Up to 9 adults and children together. Infants sit on a lap, so you can't have more infants than adults.
      </p>
      {errorMessage && (
        <p className="f3-search-error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
