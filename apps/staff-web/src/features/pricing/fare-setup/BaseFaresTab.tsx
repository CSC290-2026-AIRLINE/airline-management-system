import { useEffect, useState } from 'react'
import { errorMessage, usePricingApi, type BaseFare, type FareClass, type RouteOption } from '../api'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'

const AMOUNT = /^\d+(\.\d{1,2})?$/
const MAX_AMOUNT = 9_999_999_999.99 // NUMERIC(12,2)
const NOTICE_MS = 2000
const ROUTES_PER_PAGE = 2 // phone only; the desktop grid shows every route

// One cell of the grid: a route and a fare class.
function cellKey(routeId: string, fareClassId: string): string {
  return `${routeId}:${fareClassId}`
}

function amountText(baseFare: BaseFare | undefined): string {
  return baseFare ? String(Number(baseFare.amount)) : ''
}

type Change =
  | { kind: 'create'; key: string; route: RouteOption; fareClass: FareClass; amount: number }
  | { kind: 'update'; key: string; baseFare: BaseFare; amount: number }
  | { kind: 'delete'; key: string; baseFare: BaseFare }

export function BaseFaresTab() {
  const api = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const routes = useLoad(() => api.listRouteOptions(), 'routes')
  const currency = useLoad(() => api.getBaseCurrency(), 'currency')
  const fareClasses = useLoad(() => api.listFareClasses(false), 'fare-classes:active')
  const baseFares = useLoad(() => api.listBaseFares(), 'base-fares')

  // Only the cells staff typed in; every other cell shows the saved amount.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const saved = new Map((baseFares.data ?? []).map((bf) => [cellKey(bf.route_id, bf.fare_class_id), bf]))
  const routeList = routes.data ?? []
  const classList = fareClasses.data ?? []
  const changedKeys = Object.keys(edits).filter((key) => edits[key].trim() !== amountText(saved.get(key)))

  // Clamped so a shorter route list (after a reload) never leaves the phone on an empty page.
  const pageCount = Math.max(1, Math.ceil(routeList.length / ROUTES_PER_PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageRoutes = routeList.slice(currentPage * ROUTES_PER_PAGE, (currentPage + 1) * ROUTES_PER_PAGE)

  function setCell(key: string, value: string) {
    setEdits((current) => ({ ...current, [key]: value }))
    setCellErrors((current) => Object.fromEntries(Object.entries(current).filter(([errorKey]) => errorKey !== key)))
  }

  function discard() {
    setEdits({})
    setCellErrors({})
    setSaveError(null)
  }

  // Turns the typed cells into API calls. Clearing a saved cell removes that base fare.
  function collectChanges(): { changes: Change[]; errors: Record<string, string> } {
    const changes: Change[] = []
    const errors: Record<string, string> = {}
    for (const route of routeList) {
      for (const fareClass of classList) {
        const key = cellKey(route.id, fareClass.id)
        if (!changedKeys.includes(key)) continue
        const value = edits[key].trim()
        const baseFare = saved.get(key)
        if (value === '') {
          if (baseFare) changes.push({ kind: 'delete', key, baseFare })
        } else if (!AMOUNT.test(value) || Number(value) <= 0 || Number(value) > MAX_AMOUNT) {
          errors[key] = 'Above 0, up to 2 decimals'
        } else if (baseFare) {
          changes.push({ kind: 'update', key, baseFare, amount: Number(value) })
        } else {
          changes.push({ kind: 'create', key, route, fareClass, amount: Number(value) })
        }
      }
    }
    return { changes, errors }
  }

  function run(change: Change): Promise<unknown> {
    switch (change.kind) {
      case 'create':
        return api.createBaseFare(change.route.id, change.fareClass.id, change.amount)
      case 'update':
        return api.updateBaseFare(change.baseFare.id, change.amount)
      case 'delete':
        return api.deleteBaseFare(change.baseFare.id)
      default: {
        const unknown: never = change
        throw new Error(`Unknown change ${String(unknown)}`)
      }
    }
  }

  // Marks the cells and, on a phone, turns to the page holding the first one so staff can see what to fix.
  function showErrors(errors: Record<string, string>) {
    setCellErrors(errors)
    const first = routeList.findIndex((route) => classList.some((fc) => cellKey(route.id, fc.id) in errors))
    if (first >= 0) setPage(Math.floor(first / ROUTES_PER_PAGE))
  }

  async function save() {
    setSaveError(null)
    const { changes, errors } = collectChanges()
    if (Object.keys(errors).length) {
      showErrors(errors)
      return
    }
    const removals = changes.filter((change) => change.kind === 'delete').length
    if (removals && !window.confirm(`Remove ${removals} base fare${removals === 1 ? '' : 's'}? Cleared cells delete the saved amount.`)) {
      return
    }

    setSaving(true)
    // Each cell is its own request, so one failure does not undo the others; failed cells keep their typed value.
    const results = await Promise.allSettled(changes.map(run))
    const failed: Record<string, string> = {}
    results.forEach((result, index) => {
      if (result.status === 'rejected') failed[changes[index].key] = errorMessage(result.reason)
    })
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key in failed)))
    showErrors(failed)
    setSaving(false)
    baseFares.reload()

    const failures = Object.keys(failed).length
    if (failures) {
      setSaveError(`${changes.length - failures} saved, ${failures} failed. Fix the marked cells and save again.`)
    } else {
      setNotice({ text: `Base fares saved (${changes.length} change${changes.length === 1 ? '' : 's'})` })
    }
  }

  // One amount input. The desktop grid labels it for screen readers only (the column header shows the class);
  // the phone layout shows the class above the field and the currency inside it.
  function amountField(route: RouteOption, fc: FareClass) {
    const key = cellKey(route.id, fc.id)
    const error = cellErrors[key]
    const inputId = `bf-${key}`
    const input = (
      <input
        id={inputId}
        className={`${isPhone ? 'pr-fare-input' : 'pr-matrix-input'}${changedKeys.includes(key) ? ' is-changed' : ''}`}
        inputMode="decimal"
        placeholder="—"
        value={edits[key] ?? amountText(saved.get(key))}
        disabled={saving}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => setCell(key, e.target.value)}
      />
    )
    return (
      <>
        <label htmlFor={inputId} className={isPhone ? 'pr-fare-label' : 'pr-visually-hidden'}>
          <span className="pr-visually-hidden">
            {route.origin} to {route.destination},{' '}
          </span>
          {fc.code} · {fc.name}
          <span className="pr-visually-hidden">, in {currency.data}</span>
        </label>
        {isPhone ? (
          <span className="pr-amount-field">
            {input}
            <span className="pr-amount-suffix" aria-hidden="true">
              {currency.data}
            </span>
          </span>
        ) : (
          input
        )}
        {error && (
          <span id={`${inputId}-error`} className="pr-field-error pr-matrix-error">
            {error}
          </span>
        )}
      </>
    )
  }

  function routeLabel(route: RouteOption) {
    return (
      <>
        <strong>
          {route.origin}–{route.destination}
        </strong>
        <span>
          {route.origin_city} → {route.destination_city}
        </span>
      </>
    )
  }

  const loadError = routes.error ?? fareClasses.error ?? currency.error ?? baseFares.error

  const ready = !loadError && routes.data && fareClasses.data && currency.data && baseFares.data
  const body = loadError ? (
    <div className="pr-callout is-error" role="alert">
      Could not load base fares: {loadError}{' '}
      <button
        type="button"
        className="pr-link-button"
        onClick={() => {
          routes.reload()
          fareClasses.reload()
          currency.reload()
          baseFares.reload()
        }}
      >
        Retry
      </button>
    </div>
  ) : !routes.data || !fareClasses.data || !currency.data || !baseFares.data ? (
    <p className="pr-state">Loading base fares…</p>
  ) : routeList.length === 0 ? (
    <p className="pr-state">No routes yet. Routes come from Feature 2 (flight scheduling); prices can be set once they exist.</p>
  ) : classList.length === 0 ? (
    <p className="pr-state">No active fare classes yet. Add them on the Fare classes tab first.</p>
  ) : isPhone ? (
    <div className="pr-fare-routes">
      {pageRoutes.map((route) => (
        <section key={route.id} className="pr-fare-route" aria-labelledby={`bf-route-${route.id}`}>
          <h3 id={`bf-route-${route.id}`} className="pr-matrix-route">
            {routeLabel(route)}
          </h3>
          <div className="pr-fare-grid">
            {classList.map((fc) => (
              <div key={fc.id}>{amountField(route, fc)}</div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ) : (
    <div className="pr-table-wrap pr-matrix-wrap">
      <table className="pr-table pr-matrix">
        <thead>
          <tr>
            <th scope="col">Route</th>
            {classList.map((fc) => (
              <th key={fc.id} scope="col">
                {fc.code} · {fc.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {routeList.map((route) => (
            <tr key={route.id}>
              <th scope="row" className="pr-matrix-route">
                {routeLabel(route)}
              </th>
              {classList.map((fc) => (
                <td key={fc.id}>{amountField(route, fc)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div role="status" aria-live="polite" className="pr-banner-slot">
        {notice && <p className="pr-banner is-success">{notice.text}</p>}
      </div>

      <section className="pr-card" aria-labelledby="bf-title">
        <div className="pr-card-head">
          <h2 id="bf-title" className="pr-card-title">
            Base fares
          </h2>
          <p className="pr-muted">
            One amount per route and fare class, in the base currency ({currency.data ?? '…'}). Rules, seat fees, promos and taxes are added
            on top.
          </p>
        </div>

        <div className="pr-matrix-body">{body}</div>

        <div className="pr-card-footer pr-matrix-footer">
          <p className="pr-muted">Changes apply to new quotes only. Existing quotes keep their frozen fare.</p>
          {saveError && (
            <p className="pr-field-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="pr-actions">
            <button type="button" className="pr-button is-outline" disabled={saving || !changedKeys.length} onClick={discard}>
              Discard changes
            </button>
            <button type="button" className="pr-button is-primary" disabled={saving || !changedKeys.length} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save base fares'}
            </button>
          </div>
        </div>
      </section>

      {isPhone && ready && pageCount > 1 && (
        <nav className="pr-pager" aria-label="Base fare pages">
          <p aria-live="polite">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="pr-pager-buttons">
            {currentPage > 0 && (
              <button type="button" className="pr-button is-outline" onClick={() => setPage(currentPage - 1)}>
                ‹ Previous
              </button>
            )}
            {currentPage < pageCount - 1 && (
              <button type="button" className="pr-button is-primary" onClick={() => setPage(currentPage + 1)}>
                Next page ›
              </button>
            )}
          </div>
        </nav>
      )}
    </>
  )
}
