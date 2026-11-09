import type { FormEvent } from 'react'
import type { FlightSearchFormProps } from './contracts'
import type { FlightSearchLeg, TripType } from '../api/types'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function FlightSearchForm({ value, onChange, onSubmit, isLoading, errorMessage }: FlightSearchFormProps) {
  function setLeg(index: number, change: Partial<FlightSearchLeg>) {
    const legs = value.legs.map((leg, position) => (position === index ? { ...leg, ...change } : leg))
    if (value.tripType === 'return') legs[1] = { ...legs[1], origin: legs[0].destination, destination: legs[0].origin }
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
  const labels: Array<[TripType, string]> = [
    ['one_way', 'One-way'],
    ['return', 'Return'],
    ['multi_city', 'Multi-city'],
  ]
  return (
    <form className={`f3-search-card f3-search-form is-${value.tripType}`} onSubmit={submit} aria-label="Flight search">
      <div className="f3-search-tabs" role="group" aria-label="Trip type">
        {labels.map(([type, label]) => (
          <button type="button" key={type} aria-pressed={value.tripType === type} onClick={() => setTrip(type)}>
            {label}
          </button>
        ))}
      </div>
      <datalist id="f3-airports">
        <option value="BKK">Bangkok Suvarnabhumi</option>
        <option value="HKT">Phuket</option>
        <option value="NRT">Tokyo Narita</option>
        <option value="HKG">Hong Kong</option>
        <option value="SIN">Singapore</option>
      </datalist>
      <div className="f3-search-route-fields">
        {value.legs.map((leg, index) =>
          value.tripType === 'return' && index === 1 ? (
            <label key="return" className="f3-return-date">
              Return
              <input
                aria-label="Return date"
                type="date"
                required
                min={value.legs[0].date || today()}
                value={leg.date}
                onChange={(event) => setLeg(1, { date: event.target.value })}
              />
            </label>
          ) : (
            <fieldset className="f3-search-leg" key={index}>
              <legend>{value.tripType === 'multi_city' ? `Leg ${index + 1}` : 'Where would you like to go?'}</legend>
              <label>
                From
                <input
                  aria-label={`Leg ${index + 1} origin`}
                  placeholder="Airport code, e.g. BKK"
                  list="f3-airports"
                  autoComplete="off"
                  maxLength={3}
                  required
                  pattern="[A-Z]{3}"
                  value={leg.origin}
                  onChange={(event) => setLeg(index, { origin: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                To
                <input
                  aria-label={`Leg ${index + 1} destination`}
                  placeholder="Airport code, e.g. HKT"
                  list="f3-airports"
                  autoComplete="off"
                  maxLength={3}
                  required
                  pattern="[A-Z]{3}"
                  value={leg.destination}
                  onChange={(event) => setLeg(index, { destination: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                Depart
                <input
                  aria-label={`Leg ${index + 1} departure date`}
                  type="date"
                  required
                  min={index > 0 ? value.legs[index - 1].date || today() : today()}
                  value={leg.date}
                  onChange={(event) => setLeg(index, { date: event.target.value })}
                />
              </label>
              {value.tripType === 'multi_city' && value.legs.length > 2 && (
                <button
                  className="f3-search-remove"
                  type="button"
                  aria-label={`Remove leg ${index + 1}`}
                  onClick={() => onChange({ ...value, legs: value.legs.filter((_, position) => position !== index) })}
                >
                  Remove
                </button>
              )}
            </fieldset>
          ),
        )}
      </div>
      {value.tripType === 'multi_city' && value.legs.length < 5 && (
        <button
          className="f3-search-secondary"
          type="button"
          onClick={() =>
            onChange({ ...value, legs: [...value.legs, { origin: value.legs.at(-1)!.destination, destination: '', date: '' }] })
          }
        >
          + Add another leg (up to 5)
        </button>
      )}
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
      <div className="f3-search-submit">
        <p>Up to 9 adults and children together. Infants sit on a lap, with one infant per adult.</p>
        <button className="f3-search-primary" disabled={isLoading} type="submit">
          {isLoading ? 'Searching…' : 'Search flights'}
        </button>
      </div>
      {errorMessage && (
        <p className="f3-search-error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
