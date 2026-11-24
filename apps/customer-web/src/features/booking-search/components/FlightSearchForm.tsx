import { useState, type FormEvent, type ReactNode } from 'react'
import { Input } from '@customer-web/components/ui/input'
import { XIcon } from 'lucide-react'
import type { FlightSearchFormProps } from './contracts'
import type { FlightSearchLeg, TripType } from '../api/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { DatePicker } from '@customer-web/components/ui/date-picker'
import { Field } from '@customer-web/components/ui/field'
import { todayKey } from '@customer-web/components/ui/date-keys'
import { fieldKey, searchIssues, type SearchField } from './search-validation'
import { AIRPORTS } from './airports'

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
    return (
      <Field key={`${index}-date`} id={id} label={label} error={issue}>
        <DatePicker
          id={id}
          value={leg.date}
          min={min}
          required
          invalid={!!issue}
          ariaLabelledBy={`${id}-label`}
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
      <div
        className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:group-data-[trip=one_way]/search:grid-cols-3 lg:group-data-[trip=multi_city]/search:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
        key="return"
      >
        {airportSelect(outbound, 0, 'origin', 'From')}
        {airportSelect(outbound, 0, 'destination', 'To')}
        {dateField(outbound, 0, 'Depart', todayKey())}
        {dateField(inbound, 1, 'Return', outbound.date || todayKey())}
      </div>,
    )
  } else {
    value.legs.forEach((leg, index) => {
      /* Every multi-city row is numbered, so the "Remove destination N" button names a row the form actually shows.
         The one-way form has a single row and keeps the plain "From". */
      const fromLabel = value.tripType === 'multi_city' || index > 0 ? `Destination ${index + 1} · From` : 'From'
      rows.push(
        <div
          className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:group-data-[trip=one_way]/search:grid-cols-3 lg:group-data-[trip=multi_city]/search:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
          key={index}
        >
          {airportSelect(leg, index, 'origin', fromLabel)}
          {airportSelect(leg, index, 'destination', 'To')}
          {dateField(leg, index, 'Depart', index > 0 ? value.legs[index - 1].date || todayKey() : todayKey())}
          {value.tripType === 'multi_city' && index === lastLeg && (
            <div className="flex flex-wrap items-center justify-end gap-2.5 lg:mt-[22px]">
              {value.legs.length > 2 && (
                <button
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  type="button"
                  onClick={() => onChange({ ...value, legs: value.legs.filter((_, position) => position !== index) })}
                >
                  <XIcon aria-hidden="true" size={15} strokeWidth={2.25} />
                  Remove destination {index + 1}
                </button>
              )}
              {value.legs.length < 5 && (
                <button
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      legs: [...value.legs, { origin: value.legs.at(-1)!.destination, destination: '', date: '' }],
                    })
                  }
                >
                  + Add another destination (up to 5)
                </button>
              )}
            </div>
          )}
        </div>,
      )
    })
  }
  const partyFields = [
    ['adults', 'Adults', '(12+)'],
    ['children', 'Children', '(2–11)'],
    ['infants', 'Infants', '(under 2)'],
  ] as const
  return (
    /* `noValidate` turns off the browser's own bubbles, so every message on this form is one we wrote. */
    <form
      className="group/search rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      data-trip={value.tripType}
      onSubmit={submit}
      aria-label="Flight search"
      noValidate
    >
      <div
        className="mb-5 inline-flex w-full rounded-lg bg-muted p-[3px] sm:w-fit [&_button]:inline-flex [&_button]:h-8 [&_button]:flex-1 [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:rounded-md [&_button]:px-4 [&_button]:whitespace-nowrap [&_button]:text-sm [&_button]:font-medium [&_button]:text-foreground/60 [&_button]:transition-all [&_button:hover]:text-foreground [&_button[aria-pressed=true]]:bg-background [&_button[aria-pressed=true]]:text-foreground [&_button[aria-pressed=true]]:shadow-sm"
        role="group"
        aria-label="Trip type"
      >
        {labels.map(([type, label]) => (
          <button type="button" key={type} aria-pressed={value.tripType === type} onClick={() => setTrip(type)}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3.5">{rows}</div>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(3,minmax(0,150px))] sm:[&_label]:whitespace-nowrap [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-medium">
          {partyFields.map(([key, name, ages]) => {
            const issue = messageFor({ kind: 'party', field: key })
            const id = fieldKey({ kind: 'party', field: key })
            return (
              <Field
                key={key}
                id={id}
                label={
                  <span>
                    {name}{' '}
                    <span className="block text-xs font-normal text-muted-foreground sm:inline sm:text-sm sm:text-inherit">{ages}</span>
                  </span>
                }
                error={issue}
              >
                <Input
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
        <button
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? 'Searching…' : 'Search flights'}
        </button>
      </div>
      <p className="mt-3 mb-0 text-xs text-muted-foreground">
        Up to 9 adults and children together. Infants sit on a lap, so you can't have more infants than adults.
      </p>
      {issues.length > 0 && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {issues[0].summary}
        </p>
      )}
      {/* The message from the server is only shown when the form itself has nothing to say, so a stale message from an
          earlier search does not sit next to the messages of the fields that are wrong now. */}
      {errorMessage && issues.length === 0 && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
