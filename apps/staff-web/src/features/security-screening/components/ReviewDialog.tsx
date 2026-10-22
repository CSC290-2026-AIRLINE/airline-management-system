import { useEffect, useRef } from 'react'
import type { Decision, ScreeningRecord } from '../types'
import { Badge } from './Badge'
import { DecisionForm } from './DecisionForm'

export function ReviewDialog({
  record,
  onClose,
  onSave,
}: {
  record: ScreeningRecord
  onClose: () => void
  onSave: (decision: Decision) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const decision = record.decisions.at(-1)!
  return (
    <dialog
      ref={ref}
      className="sq-review-dialog"
      aria-labelledby="sq-dialog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
        }
      }}
    >
      <div className="sq-dialog-heading">
        <div>
          <h2 id="sq-dialog-title">Add a new review</h2>
          <p>{record.displayName} · The latest review wins; the old one is kept.</p>
        </div>
        <button className="sq-close" onClick={onClose} aria-label="Close new review">
          ×
        </button>
      </div>
      <div className="sq-current-decision">
        <h3>CURRENT DECISION</h3>
        <Badge tone={decision.status}>
          {decision.status} ·{' '}
          {decision.status === 'Confirmed' ? 'authority notified' : record.match === 'Weak' ? 'flag cleared' : 'not the same person'}
        </Badge>
        <p>“{decision.note}”</p>
      </div>
      <DecisionForm weak={record.match === 'Weak'} onSave={onSave} modal />
    </dialog>
  )
}
