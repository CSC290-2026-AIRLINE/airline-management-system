import { useEffect, useState } from 'react'
import { usePricingApi, type FareClass } from '../api'
import { Dialog } from '../components/Dialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { cabinLabel, yesNo } from '../format'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { FareClassEditor } from './FareClassEditor'

type Selection = { mode: 'edit'; id: string } | { mode: 'new' } | null

// A new object each time, so saving the same class twice restarts the timer.
interface Notice {
  text: string
  highlightId?: string
}

const NOTICE_MS = 2000

function advanceBuy(fc: FareClass): string {
  return fc.min_advance_purchase_days > 0 ? `${fc.min_advance_purchase_days} days` : 'None'
}

export function FareClassesTab() {
  const api = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const list = useLoad(() => api.listFareClasses(includeInactive), `fare-classes:${includeInactive}`)

  const fareClasses = list.data ?? []
  const selected = selection?.mode === 'edit' ? (fareClasses.find((fc) => fc.id === selection.id) ?? null) : null

  // The success banner (and the row highlight that goes with it) clears itself after NOTICE_MS.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  function open(next: Selection) {
    setSelection(next)
    setNotice(null)
  }

  function handleSaved(fareClass: FareClass) {
    const verb = selection?.mode === 'new' ? 'added' : 'saved'
    setNotice({ text: `Fare class ${fareClass.code} ${verb}`, highlightId: fareClass.id })
    // Saving closes the editor (panel, phone page or dialog) so the list goes back to full width.
    setSelection(null)
    list.reload()
  }

  function handleRemoved() {
    setNotice({ text: selected ? `Fare class ${selected.code} removed` : 'Fare class removed' })
    setSelection(null)
    list.reload()
  }

  function editor(variant: 'panel' | 'page' | 'sheet') {
    return (
      <ErrorBoundary>
        <FareClassEditor
          key={selection?.mode === 'edit' ? selection.id : 'new'}
          fareClass={selected}
          variant={variant}
          onSaved={handleSaved}
          onRemoved={handleRemoved}
          onClose={() => setSelection(null)}
        />
      </ErrorBoundary>
    )
  }

  // Phone: editing replaces the list with a full page (the "‹ Fare classes" link goes back).
  if (isPhone && selected) {
    return editor('page')
  }

  const body = list.error ? (
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
  ) : isPhone ? (
    <ul className="pr-class-cards">
      {fareClasses.map((fc) => (
        <li key={fc.id}>
          <button
            type="button"
            className={`pr-class-card${notice?.highlightId === fc.id ? ' is-highlighted' : ''}${fc.is_active ? '' : ' is-inactive'}`}
            onClick={() => open({ mode: 'edit', id: fc.id })}
          >
            <span className="pr-code-badge">{fc.code}</span>
            <span className="pr-class-card-name">
              <strong>{fc.name}</strong>
              <span>
                {cabinLabel(fc.cabin)}
                {!fc.is_active && ' · Inactive'}
              </span>
            </span>
            <span className="pr-chevron" aria-hidden="true">
              ›
            </span>
            <span className="pr-class-card-meta">
              <span>Advance buy {advanceBuy(fc)}</span>
              <span>Refund {yesNo(fc.refundable)}</span>
              <span>Change {yesNo(fc.changeable)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
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
              className={`is-clickable${selected?.id === fc.id ? ' is-selected' : ''}${notice?.highlightId === fc.id ? ' is-highlighted' : ''}${fc.is_active ? '' : ' is-inactive'}`}
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
              <td>{advanceBuy(fc)}</td>
              <td>{yesNo(fc.refundable)}</td>
              <td>{yesNo(fc.changeable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      {/* Above the table card, not inside it. The live region stays mounted so screen readers announce each message. */}
      <div role="status" aria-live="polite" className="pr-banner-slot">
        {notice && (
          <p key={notice.text + (notice.highlightId ?? '')} className="pr-banner is-success">
            {notice.text}
          </p>
        )}
      </div>

      {/* Split only while the side panel is actually shown, not while a selected class is missing from the loaded list. */}
      <div className={`pr-split${!isPhone && (selection?.mode === 'new' || selected) ? ' has-editor' : ''}`}>
        <section className="pr-card" aria-labelledby="fc-list-title">
          <div className="pr-card-intro">
            <h2 id="fc-list-title" className="pr-card-title">
              Fare classes
            </h2>
            <p className="pr-muted">Select a class to edit it. Quotes keep a frozen copy of these rules.</p>
          </div>
          <div className="pr-card-toolbar">
            <label className="pr-toggle">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => {
                  // Filtering the list closes any open editor instead of reopening it once the new list loads.
                  setIncludeInactive(e.target.checked)
                  setSelection(null)
                }}
              />
              Include inactive
            </label>
          </div>

          {body}

          <div className="pr-card-footer">
            <button type="button" className="pr-button is-outline pr-add-button" onClick={() => open({ mode: 'new' })}>
              + Add fare class
            </button>
          </div>
        </section>

        {selection?.mode === 'new' && isPhone ? (
          <Dialog labelledBy="fc-editor-title" onClose={() => setSelection(null)}>
            {editor('sheet')}
          </Dialog>
        ) : (
          selection && (selection.mode === 'new' || selected) && editor('panel')
        )}
      </div>
    </>
  )
}
