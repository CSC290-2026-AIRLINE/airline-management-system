import { useState, type FormEvent } from 'react'
import { ApiError, errorMessage, usePricingApi, type FareClass, type RouteOption } from '../api'
import { Dialog } from '../components/Dialog'
import { formatMoney } from '../format'
import { useLoad } from '../hooks/useLoad'
import { useAddOnChargesApi, type BaggageCharge, type BaggageRate, type BaggageRateInput } from './api'
import { formatKg } from './labels'

type Selection = { mode: 'edit'; rate: BaggageRate } | { mode: 'new' } | null

const KG = /^\d+(\.\d)?$/ // NUMERIC(5,1)
const MONEY = /^\d+(\.\d{1,2})?$/

function routeLabel(route: { origin: string; destination: string } | null): string {
  return route ? `${route.origin} → ${route.destination}` : 'Default, all routes'
}

export function BaggageRatesTab() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const rates = useLoad(() => api.listBaggageRates(), 'baggage-rates')
  const fareClasses = useLoad(() => pricingApi.listFareClasses(true), 'fare-classes:all')
  const routes = useLoad(() => pricingApi.listRouteOptions(), 'routes')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const loadError = rates.error ?? fareClasses.error ?? routes.error ?? currency.error
  const ready = rates.data && fareClasses.data && routes.data && currency.data

  function done(message: string) {
    setNotice(message)
    setSelection(null)
    rates.reload()
  }

  // Grouped by fare class; the default row comes first (the API sorts route_id nulls first).
  const groups = (fareClasses.data ?? [])
    .map((fareClass) => ({ fareClass, rows: (rates.data ?? []).filter((rate) => rate.fare_class_id === fareClass.id) }))
    .filter((group) => group.rows.length > 0)

  return (
    <>
      <section className="pr-card" aria-labelledby="br-title">
        <div className="pr-card-toolbar">
          <h2 id="br-title" className="pr-editor-title">
            Overweight baggage rates
          </h2>
          <span className="pr-muted">Free allowance per bag and the price per extra kg. A route-specific rate beats the default.</span>
          {notice && (
            <span className="pr-notice" role="status">
              {notice}
            </span>
          )}
        </div>

        {loadError ? (
          <div className="pr-callout is-error" role="alert">
            Could not load baggage rates: {loadError}{' '}
            <button
              type="button"
              className="pr-link-button"
              onClick={() => {
                rates.reload()
                fareClasses.reload()
                routes.reload()
                currency.reload()
              }}
            >
              Retry
            </button>
          </div>
        ) : !ready ? (
          <p className="pr-state">Loading baggage rates…</p>
        ) : fareClasses.data!.length === 0 ? (
          <p className="pr-state">No fare classes yet. Add them on Fare Setup first.</p>
        ) : groups.length === 0 ? (
          <p className="pr-state">No baggage rates yet. Add a default rate for each fare class.</p>
        ) : (
          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Free per bag</th>
                  <th>Price per extra kg</th>
                  <th>Max bag weight</th>
                  <th>
                    <span className="pr-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              {groups.map(({ fareClass, rows }) => (
                <tbody key={fareClass.id}>
                  <tr className="pr-group-row">
                    <th colSpan={5} scope="colgroup">
                      <span className="pr-mono">{fareClass.code}</span> {fareClass.name}
                      {!fareClass.is_active && <span className="pr-pill">Inactive</span>}
                    </th>
                  </tr>
                  {rows.map((rate) => (
                    <tr key={rate.id}>
                      <td>{routeLabel(rate.route)}</td>
                      <td>{formatKg(rate.free_allowance_kg)}</td>
                      <td>{formatMoney(rate.rate_per_kg, currency.data!)}</td>
                      <td>{formatKg(rate.max_bag_kg)}</td>
                      <td className="pr-row-actions">
                        <button
                          type="button"
                          className="pr-button is-outline is-small"
                          onClick={() => {
                            setNotice(null)
                            setSelection({ mode: 'edit', rate })
                          }}
                        >
                          Edit<span className="pr-visually-hidden"> {`${fareClass.code} ${routeLabel(rate.route)}`}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}

        <div className="pr-card-footer">
          <button
            type="button"
            className="pr-button is-outline pr-add-button"
            disabled={!ready || fareClasses.data!.length === 0}
            onClick={() => {
              setNotice(null)
              setSelection({ mode: 'new' })
            }}
          >
            + Add baggage rate
          </button>
        </div>

        {selection && ready && (
          <Dialog labelledBy="br-editor-title" onClose={() => setSelection(null)}>
            <BaggageRateForm
              rate={selection.mode === 'edit' ? selection.rate : null}
              fareClasses={fareClasses.data!}
              routes={routes.data!}
              currency={currency.data!}
              onSaved={() => done('Baggage rate saved')}
              onRemoved={() => done('Baggage rate removed')}
              onClose={() => setSelection(null)}
            />
          </Dialog>
        )}
      </section>

      {ready && fareClasses.data!.length > 0 && (
        <TryCharge fareClasses={fareClasses.data!} routes={routes.data!} currency={currency.data!} />
      )}
    </>
  )
}

interface FormState {
  fare_class_id: string
  route_id: string // '' = default for all routes
  free_allowance_kg: string
  rate_per_kg: string
  max_bag_kg: string // '' = no limit
}

type FieldErrors = Partial<Record<keyof FormState, string>>

// Same rules as CreateBaggageRateDto and the BAGGAGE_RATE_INVALID check on the backend, which validates again.
function validate(form: FormState): { input?: BaggageRateInput; errors: FieldErrors } {
  const errors: FieldErrors = {}
  if (!form.fare_class_id) errors.fare_class_id = 'Pick a fare class'
  if (!KG.test(form.free_allowance_kg)) errors.free_allowance_kg = '0 or more, up to 1 decimal'
  if (!MONEY.test(form.rate_per_kg)) errors.rate_per_kg = '0 or more, up to 2 decimals'
  if (form.max_bag_kg !== '' && (!KG.test(form.max_bag_kg) || Number(form.max_bag_kg) <= 0)) {
    errors.max_bag_kg = 'Above 0, up to 1 decimal, or empty for no limit'
  }
  if (!errors.free_allowance_kg && !errors.max_bag_kg && form.max_bag_kg !== '') {
    if (Number(form.free_allowance_kg) >= Number(form.max_bag_kg)) errors.free_allowance_kg = 'Must be less than the max bag weight'
  }
  if (Object.keys(errors).length) return { errors }
  return {
    errors,
    input: {
      fare_class_id: form.fare_class_id,
      route_id: form.route_id || null,
      free_allowance_kg: Number(form.free_allowance_kg),
      rate_per_kg: Number(form.rate_per_kg),
      max_bag_kg: form.max_bag_kg === '' ? null : Number(form.max_bag_kg),
    },
  }
}

interface BaggageRateFormProps {
  rate: BaggageRate | null // null = adding a new one
  fareClasses: FareClass[]
  routes: RouteOption[]
  currency: string
  onSaved: () => void
  onRemoved: () => void
  onClose: () => void
}

function BaggageRateForm({ rate, fareClasses, routes, currency, onSaved, onRemoved, onClose }: BaggageRateFormProps) {
  const api = useAddOnChargesApi()
  const [form, setForm] = useState<FormState>(
    rate
      ? {
          fare_class_id: rate.fare_class_id,
          route_id: rate.route_id ?? '',
          free_allowance_kg: String(Number(rate.free_allowance_kg)),
          rate_per_kg: String(Number(rate.rate_per_kg)),
          max_bag_kg: rate.max_bag_kg === null ? '' : String(Number(rate.max_bag_kg)),
        }
      : { fare_class_id: fareClasses[0]?.id ?? '', route_id: '', free_allowance_kg: '20', rate_per_kg: '', max_bag_kg: '32' },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const { input, errors: found } = validate(form)
    setErrors(found)
    setServerError(null)
    if (!input) return
    setBusy(true)
    try {
      await (rate ? api.updateBaggageRate(rate.id, input) : api.createBaggageRate(input))
      onSaved()
    } catch (error) {
      // A duplicate means this fare class already has a rate for the chosen route (or a default).
      if (error instanceof ApiError && error.code === 'BAGGAGE_RATE_EXISTS') setErrors({ route_id: error.message })
      else setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!rate || !window.confirm(`Remove the ${rate.fare_class.code} baggage rate for ${routeLabel(rate.route)}?`)) return
    setBusy(true)
    setServerError(null)
    try {
      await api.deleteBaggageRate(rate.id)
      onRemoved()
    } catch (error) {
      setServerError(errorMessage(error))
      setBusy(false)
    }
  }

  function fieldProps(field: keyof FormState) {
    return {
      id: `br-${field}`,
      'aria-invalid': errors[field] ? true : undefined,
      'aria-describedby': errors[field] ? `br-${field}-error` : undefined,
    }
  }

  function fieldError(field: keyof FormState) {
    return errors[field] ? (
      <span id={`br-${field}-error`} className="pr-field-error">
        {errors[field]}
      </span>
    ) : null
  }

  return (
    <div className="pr-editor">
      <div className="pr-sheet-handle" aria-hidden="true" />
      <div className="pr-editor-head">
        <h2 id="br-editor-title" className="pr-editor-title is-sheet">
          {rate ? `${rate.fare_class.code} · ${routeLabel(rate.route)}` : 'Add baggage rate'}
        </h2>
        <button type="button" className="pr-icon-button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pr-field">
          <label htmlFor="br-fare_class_id">Fare class</label>
          <select {...fieldProps('fare_class_id')} value={form.fare_class_id} onChange={(e) => set('fare_class_id', e.target.value)}>
            {fareClasses.map((fareClass) => (
              <option key={fareClass.id} value={fareClass.id}>
                {fareClass.code} · {fareClass.name}
                {fareClass.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
          {fieldError('fare_class_id')}
        </div>

        <div className="pr-field">
          <label htmlFor="br-route_id">Route</label>
          <select {...fieldProps('route_id')} value={form.route_id} onChange={(e) => set('route_id', e.target.value)}>
            <option value="">Default, all routes</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {routeLabel(route)}
              </option>
            ))}
          </select>
          {fieldError('route_id')}
        </div>

        <div className="pr-fee-grid">
          <div className="pr-field">
            <label htmlFor="br-free_allowance_kg">Free per bag (kg)</label>
            <input
              {...fieldProps('free_allowance_kg')}
              inputMode="decimal"
              value={form.free_allowance_kg}
              onChange={(e) => set('free_allowance_kg', e.target.value)}
            />
            {fieldError('free_allowance_kg')}
          </div>
          <div className="pr-field">
            <label htmlFor="br-rate_per_kg">Price per extra kg ({currency})</label>
            <input
              {...fieldProps('rate_per_kg')}
              inputMode="decimal"
              value={form.rate_per_kg}
              onChange={(e) => set('rate_per_kg', e.target.value)}
            />
            {fieldError('rate_per_kg')}
          </div>
          <div className="pr-field">
            <label htmlFor="br-max_bag_kg">Max bag weight (kg)</label>
            <input
              {...fieldProps('max_bag_kg')}
              inputMode="decimal"
              placeholder="No limit"
              value={form.max_bag_kg}
              onChange={(e) => set('max_bag_kg', e.target.value)}
            />
            {fieldError('max_bag_kg')}
          </div>
        </div>

        <p className="pr-help">Extra weight is rounded up to a whole kg. A bag over the max weight is refused and must go as cargo.</p>

        {serverError && (
          <div className="pr-callout is-error" role="alert">
            {serverError}
          </div>
        )}

        <div className="pr-actions">
          <button type="submit" className="pr-button is-primary" disabled={busy}>
            {busy ? 'Saving…' : rate ? 'Save' : 'Add'}
          </button>
          {rate && (
            <button type="button" className="pr-button is-danger" disabled={busy} onClick={() => void handleRemove()}>
              Remove
            </button>
          )}
          <button type="button" className="pr-button is-outline" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

interface TryChargeProps {
  fareClasses: FareClass[]
  routes: RouteOption[]
  currency: string
}

// "Try it": asks the backend for the charge, so staff see exactly what check-in will charge.
function TryCharge({ fareClasses, routes, currency }: TryChargeProps) {
  const api = useAddOnChargesApi()
  const [fareClassId, setFareClassId] = useState(fareClasses[0]?.id ?? '')
  const [routeId, setRouteId] = useState('')
  const [weight, setWeight] = useState('')
  const [result, setResult] = useState<BaggageCharge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setResult(null)
    setError(null)
    if (!/^\d+(\.\d+)?$/.test(weight) || Number(weight) <= 0) {
      setError('Enter a bag weight above 0 kg')
      return
    }
    setBusy(true)
    try {
      setResult(await api.baggageCharge(fareClassId, Number(weight), routeId || undefined))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pr-card pr-try-charge" aria-labelledby="bc-title">
      <div className="pr-card-toolbar">
        <h2 id="bc-title" className="pr-editor-title">
          Try it: charge for one bag
        </h2>
      </div>
      <form className="pr-editor" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="pr-fee-grid">
          <div className="pr-field">
            <label htmlFor="bc-fare-class">Fare class</label>
            <select id="bc-fare-class" value={fareClassId} onChange={(e) => setFareClassId(e.target.value)}>
              {fareClasses.map((fareClass) => (
                <option key={fareClass.id} value={fareClass.id}>
                  {fareClass.code} · {fareClass.name}
                </option>
              ))}
            </select>
          </div>
          <div className="pr-field">
            <label htmlFor="bc-route">Route</label>
            <select id="bc-route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">Any route (default rate)</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {routeLabel(route)}
                </option>
              ))}
            </select>
          </div>
          <div className="pr-field">
            <label htmlFor="bc-weight">Bag weight (kg)</label>
            <input id="bc-weight" inputMode="decimal" placeholder="e.g. 25.4" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
        </div>
        <div className="pr-actions">
          <button type="submit" className="pr-button is-primary" disabled={busy || !fareClassId}>
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
        </div>

        <div aria-live="polite">
          {error && (
            <div className="pr-callout is-error" role="alert">
              {error}
            </div>
          )}
          {result && (
            <p className="pr-charge-result">
              <strong>{formatMoney(result.charge, currency)}</strong>
              <span className="pr-muted">
                {result.chargeable_kg === 0
                  ? `Within the ${result.free_allowance_kg} kg free allowance`
                  : `${result.weight_kg} kg − ${result.free_allowance_kg} kg free = ${result.chargeable_kg} kg (rounded up) × ${formatMoney(result.rate_per_kg, currency)}`}
                {result.route_id ? ' · route rate' : ' · default rate'}
              </span>
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
