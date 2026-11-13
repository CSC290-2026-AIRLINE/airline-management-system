import { useState, type FormEvent, type ReactNode } from 'react'
import { XIcon } from 'lucide-react'
import type { FlightSearchFormProps } from './contracts'
import type { FlightSearchLeg, TripType } from '../api/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { DatePicker } from '@customer-web/components/ui/date-picker'
import { fieldKey, searchIssues, type SearchField } from './search-validation'
import { AIRPORTS } from './airports'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A date as a screen reader reads it out, so the chosen day is announced with the field it belongs to. */
function spokenDate(key: string) {
  if (!key) return ''
  const [year, month, day] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

interface FieldProps {
  /** The id of the control, so the label can point at it. */
  id: string
  /** The text above the control. */
  label: string
  /** The message under the control, when the value is wrong. */
  error?: string
  children: ReactNode
}

/**
 * A label, a control and the message under it. The message sits outside the label, so it never becomes part of the
 * name a screen reader reads for the field, and the control points at it with `aria-describedby`.
 */
function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="f3-search-field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p className="f3-search-field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

export function FlightSearchForm({ value, onChange, onSubmit, isLoading, errorMessage }: FlightSearchFormProps) {
  /* The messages are shown once the search has been pressed, so the form is not full of red text before the customer
     has done anything. After that they follow the values, so a fixed field loses its message right away. */
  const [attempted, setAttempted] = useState(false)
  const issues = attempted ? searchIssues(value) : []
  const messageFor = (field: SearchField) => issues.find((issue) => issue.key === fieldKey(field))?.message

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
    setAttempted(true)
    const problems = searchIssues(value)
    if (problems.length) {
      /* The first field that is wrong gets the focus, so the customer is taken to the problem instead of to the top of
         the page. */
      document.getElementById(fieldKey(problems[0].field))?.focus()
      return
    }
    onSubmit(value)
  }
  function airportSelect(leg: FlightSearchLeg, index: number, field: 'origin' | 'destination', label: string) {
    const issue = messageFor({ kind: 'leg', legIndex: index, field })
    const id = fieldKey({ kind: 'leg', legIndex: index, field })
    return (
      <Field key={`${index}-${field}`} id={id} label={label} error={issue}>
        <Select value={leg[field]} onValueChange={(value) => setLeg(index, { [field]: value })} required>
          <SelectTrigger
            id={id}
            aria-labelledby={`${id}-label`}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? `${id}-error` : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Select airport</SelectItem>
            {AIRPORTS.map((airport) => (
              <SelectItem key={airport.code} value={airport.code}>
                {airport.city} ({airport.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    )
  }
  function dateField(leg: FlightSearchLeg, index: number, label: string, min: string) {
    const issue = messageFor({ kind: 'leg', legIndex: index, field: 'date' })
    const id = fieldKey({ kind: 'leg', legIndex: index, field: 'date' })
    /* The calendar trigger is a button, so the name comes from the label. The chosen day is part of that name, so a
       screen reader says which day the field holds. */
    const spoken = spokenDate(leg.date)
    return (
      <Field key={`${index}-date`} id={id} label={label} error={issue}>
        <DatePicker
          id={id}
          value={leg.date}
          min={min}
          required
          invalid={!!issue}
          ariaLabel={spoken ? `${label} date, ${spoken}` : `${label} date`}
          describedBy={issue ? `${id}-error` : undefined}
          onChange={(date) => setLeg(index, { date })}
        />
      </Field>
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
        {dateField(outbound, 0, 'Depart', today())}
        {dateField(inbound, 1, 'Return', outbound.date || today())}
      </div>,
    )
  } else {
    value.legs.forEach((leg, index) => {
      /* Every multi-city row is numbered, so the "Remove leg N" button names a row the form actually shows. The
         one-way form has a single row and keeps the plain "From". */
      const fromLabel = value.tripType === 'multi_city' || index > 0 ? `Leg ${index + 1} · From` : 'From'
      rows.push(
        <div className="f3-search-leg-row" key={index}>
          {airportSelect(leg, index, 'origin', fromLabel)}
          {airportSelect(leg, index, 'destination', 'To')}
          {dateField(leg, index, 'Depart', index > 0 ? value.legs[index - 1].date || today() : today())}
          {value.tripType === 'multi_city' && index === lastLeg && (
            <div className="f3-search-leg-actions">
              {value.legs.length > 2 && (
                <button
                  className="f3-search-remove"
                  type="button"
                  onClick={() => onChange({ ...value, legs: value.legs.filter((_, position) => position !== index) })}
                >
                  <XIcon aria-hidden="true" size={15} strokeWidth={2.25} />
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
  const partyFields = [
    ['adults', 'Adults (12+)'],
    ['children', 'Children (2–11)'],
    ['infants', 'Infants (under 2)'],
  ] as const
  return (
    /* `noValidate` turns off the browser's own bubbles, so every message on this form is one we wrote. */
    <form className={`f3-search-card f3-search-form is-${value.tripType}`} onSubmit={submit} aria-label="Flight search" noValidate>
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
          {partyFields.map(([key, label]) => {
            const issue = messageFor({ kind: 'party', field: key })
            const id = fieldKey({ kind: 'party', field: key })
            return (
              <Field key={key} id={id} label={label} error={issue}>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={key === 'infants' ? value.adults : 9 - value[key === 'adults' ? 'children' : 'adults']}
                  step={1}
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? `${id}-error` : undefined}
                  value={value[key]}
                  onChange={(event) => {
                    const count = Number(event.target.value)
                    onChange({ ...value, [key]: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0 })
                  }}
                />
              </Field>
            )
          })}
        </div>
        <button className="f3-search-primary" disabled={isLoading} type="submit">
          {isLoading ? 'Searching…' : 'Search flights'}
        </button>
      </div>
      <p className="f3-search-hint">
        Up to 9 adults and children together. Infants sit on a lap, so you can't have more infants than adults.
      </p>
      {issues.length > 0 && (
        <p className="f3-search-error" role="alert">
          {issues[0].summary}
        </p>
      )}
      {/* The message from the server is only shown when the form itself has nothing to say, so a stale message from an
          earlier search does not sit next to the messages of the fields that are wrong now. */}
      {errorMessage && issues.length === 0 && (
        <p className="f3-search-error" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
