import { useState } from 'react'
import { usePricingApi, type FareClass } from '../api'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { cabinLabel, yesNo } from '../format'
import { useLoad } from '../hooks/useLoad'
import { FareClassEditor } from './FareClassEditor'

type Selection = { mode: 'edit'; id: string } | { mode: 'new' } | null

export function FareClassesTab() {
  const api = usePricingApi()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const list = useLoad(() => api.listFareClasses(includeInactive), `fare-classes:${includeInactive}`)

  const fareClasses = list.data ?? []
  const selected = selection?.mode === 'edit' ? (fareClasses.find((fc) => fc.id === selection.id) ?? null) : null

  function open(next: Selection) {
    setSelection(next)
    setNotice(null)
  }

  function handleSaved(fareClass: FareClass) {
    setNotice(`Saved ${fareClass.code} · ${fareClass.name}`)
    setSelection({ mode: 'edit', id: fareClass.id })
    list.reload()
  }

  function handleRemoved() {
    setNotice('Fare class removed')
    setSelection(null)
    list.reload()
  }

  return (
    <div className={`pr-split${selection ? ' has-editor' : ''}`}>
      <section className="pr-card" aria-label="Fare classes">
        <div className="pr-card-toolbar">
          <label className="pr-toggle">
            <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
            Include inactive
          </label>
          {notice && (
            <span className="pr-notice" role="status">
              {notice}
            </span>
          )}
        </div>

        {list.error ? (
          <div className="pr-callout is-error" role="alert">
            Could not load fare classes: {list.error}{' '}
            <button type="button" className="pr-link-button" onClick={list.reload}>
              Retry
            </button>
          </div>
        ) : list.loading && !list.data ? (
          <p className="pr-state">Loading fare classes…</p>
        ) : fareClasses.length === 0 ? (
          <p className="pr-state">No fare classes yet. Add one to start pricing routes.</p>
        ) : (
          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Cabin</th>
                  <th>Advance buy</th>
                  <th>Refund</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {fareClasses.map((fc) => (
                  <tr
                    key={fc.id}
                    tabIndex={0}
                    aria-selected={selected?.id === fc.id}
                    className={`is-clickable${selected?.id === fc.id ? ' is-selected' : ''}${fc.is_active ? '' : ' is-inactive'}`}
                    onClick={() => open({ mode: 'edit', id: fc.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        open({ mode: 'edit', id: fc.id })
                      }
                    }}
                  >
                    <td className="pr-mono">{fc.code}</td>
                    <td>
                      {fc.name}
                      {!fc.is_active && <span className="pr-pill">Inactive</span>}
                    </td>
                    <td>{cabinLabel(fc.cabin)}</td>
                    <td>{fc.min_advance_purchase_days > 0 ? `${fc.min_advance_purchase_days} days` : 'None'}</td>
                    <td>{yesNo(fc.refundable)}</td>
                    <td>{yesNo(fc.changeable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="pr-card-footer">
          <button type="button" className="pr-button is-outline" onClick={() => open({ mode: 'new' })}>
            Add fare class
          </button>
        </div>
      </section>

      {selection && (selection.mode === 'new' || selected) && (
        <ErrorBoundary>
          <FareClassEditor
            key={selection.mode === 'new' ? 'new' : selection.id}
            fareClass={selected}
            onSaved={handleSaved}
            onRemoved={handleRemoved}
            onClose={() => setSelection(null)}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
