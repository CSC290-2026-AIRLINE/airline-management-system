import { useState, type FormEvent } from 'react'
import { errorMessage, usePricingApi, type BaseFare, type FareClass } from '../api'
import { cabinLabel, formatMoney } from '../format'
import { useLoad } from '../hooks/useLoad'

const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)

export function BaseFaresTab() {
  const api = usePricingApi()
  const [routeId, setRouteId] = useState('')
  const routes = useLoad(() => api.listRouteOptions(), 'routes')
  const currency = useLoad(() => api.getBaseCurrency(), 'currency')
  const fareClasses = useLoad(() => api.listFareClasses(true), 'fare-classes:all')
  const baseFares = useLoad(() => (routeId ? api.listBaseFares(routeId) : Promise.resolve([])), `base-fares:${routeId}`)

  const loadError = routes.error ?? fareClasses.error ?? currency.error

  return (
    <section className="pr-card" aria-label="Base fares">
      <div className="pr-card-toolbar">
        <div className="pr-field is-inline">
          <label htmlFor="bf-route">Route</label>
          <select id="bf-route" value={routeId} onChange={(e) => setRouteId(e.target.value)} disabled={!routes.data?.length}>
            <option value="">{routes.loading ? 'Loading routes…' : 'Pick a route'}</option>
            {routes.data?.map((route) => (
              <option key={route.id} value={route.id}>
                {route.origin} → {route.destination}
              </option>
            ))}
          </select>
        </div>
        <span className="pr-muted">Amounts in {currency.data ?? '…'}, before pricing rules, seat fees, promos and taxes.</span>
      </div>

      {loadError ? (
        <div className="pr-callout is-error" role="alert">
          Could not load: {loadError}{' '}
          <button
            type="button"
            className="pr-link-button"
            onClick={() => {
              routes.reload()
              fareClasses.reload()
              currency.reload()
            }}
          >
            Retry
          </button>
        </div>
      ) : routes.data?.length === 0 ? (
        <p className="pr-state">No routes yet. Routes come from Feature 2 (flight scheduling); prices can be set once they exist.</p>
      ) : !routeId ? (
        <p className="pr-state">Pick a route to see and set the base fare for each fare class.</p>
      ) : baseFares.error ? (
        <div className="pr-callout is-error" role="alert">
          Could not load base fares: {baseFares.error}{' '}
          <button type="button" className="pr-link-button" onClick={baseFares.reload}>
            Retry
          </button>
        </div>
      ) : !baseFares.data || !fareClasses.data || !currency.data ? (
        <p className="pr-state">Loading base fares…</p>
      ) : fareClasses.data.length === 0 ? (
        <p className="pr-state">No fare classes yet. Add them on the Fare classes tab first.</p>
      ) : (
        <div className="pr-table-wrap">
          {/* is-stacked: on a phone each row becomes a card (pricing.css). */}
          <table className="pr-table is-stacked">
            <thead>
              <tr>
                <th>Code</th>
                <th>Fare class</th>
                <th>Cabin</th>
                <th>Base fare</th>
                <th>
                  <span className="pr-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {fareClasses.data.map((fc) => {
                const baseFare = baseFares.data?.find((bf) => bf.fare_class_id === fc.id)
                return (
                  <BaseFareRow
                    key={`${fc.id}:${baseFare?.id ?? 'none'}:${baseFare?.amount ?? ''}`}
                    routeId={routeId}
                    fareClass={fc}
                    baseFare={baseFare}
                    currency={currency.data!}
                    onChanged={baseFares.reload}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

interface BaseFareRowProps {
  routeId: string
  fareClass: FareClass
  baseFare?: BaseFare
  currency: string
  onChanged: () => void
}

// One fare class on the chosen route: edit the amount inline, add it if missing, or remove it.
function BaseFareRow({ routeId, fareClass, baseFare, currency, onChanged }: BaseFareRowProps) {
  const api = usePricingApi()
  const [amount, setAmount] = useState(baseFare ? String(Number(baseFare.amount)) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = `bf-amount-${fareClass.id}`
  const dirty = baseFare ? amount !== String(Number(baseFare.amount)) : amount !== ''

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!AMOUNT.test(amount) || Number(amount) <= 0 || Number(amount) > MAX_AMOUNT) {
      setError('Enter an amount above 0 with up to 2 decimals')
      return
    }
    void run(() => (baseFare ? api.updateBaseFare(baseFare.id, Number(amount)) : api.createBaseFare(routeId, fareClass.id, Number(amount))))
  }

  function handleRemove() {
    if (!baseFare || !window.confirm(`Remove the ${fareClass.code} base fare on this route?`)) return
    void run(() => api.deleteBaseFare(baseFare.id))
  }

  return (
    <tr className={fareClass.is_active ? undefined : 'is-inactive'}>
      <td className="pr-mono pr-cell-code">{fareClass.code}</td>
      <td className="pr-cell-name">
        {fareClass.name}
        {!fareClass.is_active && <span className="pr-pill">Inactive</span>}
      </td>
      <td className="pr-cell-cabin">{cabinLabel(fareClass.cabin)}</td>
      <td className="pr-cell-amount">
        <form id={`bf-form-${fareClass.id}`} onSubmit={handleSubmit} className="pr-inline-form" noValidate>
          <label htmlFor={inputId} className="pr-visually-hidden">
            Base fare for {fareClass.code} in {currency}
          </label>
          <input
            id={inputId}
            className="pr-amount-input"
            inputMode="decimal"
            placeholder="Not set"
            value={amount}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
          {baseFare && !dirty && <span className="pr-muted">{formatMoney(baseFare.amount, currency)}</span>}
        </form>
        {error && (
          <span id={`${inputId}-error`} className="pr-field-error" role="alert">
            {error}
          </span>
        )}
      </td>
      <td className="pr-row-actions">
        <button type="submit" form={`bf-form-${fareClass.id}`} className="pr-button is-primary is-small" disabled={busy || !dirty}>
          {baseFare ? 'Save' : 'Add'}
        </button>
        {baseFare && (
          <button type="button" className="pr-button is-danger is-small" disabled={busy} onClick={handleRemove}>
            Remove
          </button>
        )}
      </td>
    </tr>
  )
}
