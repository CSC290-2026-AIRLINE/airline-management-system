import { useEffect, useState } from 'react'
import { errorMessage, SEAT_TYPES, usePricingApi, type PriceSimulation, type SeatType } from '../api'
import { seatTypeLabel } from './describe'

const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)
const DEBOUNCE_MS = 300
const DAY_MS = 86_400_000

const MONEY = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function inOneWeek(): string {
  return new Date(Date.now() + 7 * DAY_MS).toISOString().slice(0, 10)
}

interface Form {
  baseFare: string
  departure: string
  seatsLeft: string
  seatType: SeatType
}

type Field = 'baseFare' | 'departure' | 'seatsLeft'

function validate(form: Form): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  if (!AMOUNT.test(form.baseFare) || Number(form.baseFare) > MAX_AMOUNT) errors.baseFare = '0 or more, up to 2 decimals'
  if (!form.departure) errors.departure = 'Pick a date'
  if (!AMOUNT.test(form.seatsLeft) || Number(form.seatsLeft) > 100) errors.seatsLeft = '0 to 100, up to 2 decimals'
  return errors
}

interface SimulatorCardProps {
  variant: 'panel' | 'page' // panel: desktop, beside the rules. page: phone, replaces the page.
  refreshKey: number // goes up when rules or seat fees change, so the numbers follow them
  onClose: () => void
}

export function SimulatorCard({ variant, refreshKey, onClose }: SimulatorCardProps) {
  const api = usePricingApi()
  const [form, setForm] = useState<Form>({ baseFare: '100', departure: inOneWeek(), seatsLeft: '15', seatType: 'normal' })
  const [result, setResult] = useState<PriceSimulation | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

  const errors = validate(form)
  const valid = Object.keys(errors).length === 0
  const requestKey = valid ? JSON.stringify(form) : null

  // Recalculates a moment after typing stops. The last result stays on screen until the new one arrives.
  useEffect(() => {
    if (!valid) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      api
        .simulatePrice({
          base_fare: Number(form.baseFare),
          departure_date: form.departure,
          seats_left_pct: Number(form.seatsLeft),
          seat_type: form.seatType,
        })
        .then(
          (next) => {
            if (cancelled) return
            setResult(next)
            setRequestError(null)
          },
          (error: unknown) => {
            if (!cancelled) setRequestError(errorMessage(error))
          },
        )
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey stands for the form; api is a new object each render
  }, [requestKey, refreshKey])

  function set<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function amountInput(field: Field, label: string, unit: string) {
    const id = `sim-${field}`
    return (
      <div className="pr-field">
        <label htmlFor={id}>{label}</label>
        <span className="pr-amount-field">
          <input
            id={id}
            className="pr-fare-input"
            inputMode="decimal"
            value={form[field]}
            aria-invalid={errors[field] ? true : undefined}
            aria-describedby={errors[field] ? `${id}-error` : undefined}
            onChange={(e) => set(field, e.target.value)}
          />
          <span className="pr-amount-suffix" aria-hidden="true">
            {unit}
          </span>
        </span>
        {errors[field] && (
          <span id={`${id}-error`} className="pr-field-error">
            {errors[field]}
          </span>
        )}
      </div>
    )
  }

  const body = (
    <>
      <div className="pr-sim-row">
        {amountInput('baseFare', 'Base fare', result?.currency ?? '')}
        <div className="pr-field">
          <label htmlFor="sim-departure">Departure</label>
          <input
            id="sim-departure"
            type="date"
            value={form.departure}
            aria-invalid={errors.departure ? true : undefined}
            onChange={(e) => set('departure', e.target.value)}
          />
          {errors.departure && <span className="pr-field-error">{errors.departure}</span>}
        </div>
      </div>

      <div className="pr-sim-row">
        {amountInput('seatsLeft', 'Seats left', '%')}
        <div className="pr-field">
          <label htmlFor="sim-seat">Seat type</label>
          <select id="sim-seat" value={form.seatType} onChange={(e) => set('seatType', e.target.value as SeatType)}>
            {SEAT_TYPES.map((type) => (
              <option key={type} value={type}>
                {seatTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="pr-field">
        <label htmlFor="sim-promo">Promo code</label>
        {/* Promo codes have no backend yet, so there is nothing to pick. */}
        <select id="sim-promo" disabled title="Promo codes are not built yet">
          <option>None</option>
        </select>
      </div>

      {requestError ? (
        <div className="pr-callout is-error" role="alert">
          {requestError}
        </div>
      ) : !result ? (
        <p className="pr-state">Working out the price…</p>
      ) : (
        <>
          <p className="pr-sim-note">
            Days to departure: {result.days_to_departure} · Today {DAY.format(new Date(result.today))}
          </p>
          <ul className="pr-sim-lines" aria-label="Price breakdown">
            {result.lines.map((line, index) => (
              <li key={`${line.label}:${line.detail ?? ''}`}>
                <span>
                  {line.label}
                  {line.detail && <small>{line.detail}</small>}
                </span>
                <strong>
                  {index > 0 && line.amount >= 0 ? '+' : ''}
                  {line.amount < 0 ? '−' : ''}
                  {MONEY.format(Math.abs(line.amount))}
                </strong>
              </li>
            ))}
          </ul>
          <div className="pr-sim-total" aria-live="polite">
            <span>Total per passenger</span>
            <strong>
              {MONEY.format(result.total)} {result.currency}
            </strong>
          </div>
          <p className="pr-sim-note">
            {result.unmatched_groups.length > 0 && `No rule matched in: ${result.unmatched_groups.join(', ')}. `}
            Quote is held for {result.quote_hold_minutes} minutes.
          </p>
        </>
      )}
    </>
  )

  if (variant === 'page') {
    return (
      <section className="pr-editor-page" aria-labelledby="sim-title">
        <button type="button" className="pr-back-link" onClick={onClose}>
          ‹ Pricing rules
        </button>
        <h2 id="sim-title" className="pr-editor-page-title">
          Price simulator
        </h2>
        <p className="pr-sim-lead">Dry run, nothing is saved</p>
        <div className="pr-card">{body}</div>
      </section>
    )
  }

  return (
    <section className="pr-card" aria-labelledby="sim-title">
      <div className="pr-card-head has-action">
        <div>
          <h2 id="sim-title" className="pr-card-title">
            Price simulator
          </h2>
          <p className="pr-muted">Dry run, nothing is saved</p>
        </div>
        <button type="button" className="pr-icon-button" aria-label="Close price simulator" onClick={onClose}>
          ×
        </button>
      </div>
      {body}
    </section>
  )
}
