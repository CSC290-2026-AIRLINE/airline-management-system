import { useEffect, useRef } from 'react'
import type { ReviewDraft, ReviewSubmission, ScreeningRecord } from '../types'
import { decisionLabel, latestReview, reviewStatus } from '../screening-model'
import { Badge } from './Badge'
import { DecisionForm } from './DecisionForm'

export function ReviewDialog({
  record,
  onClose,
  onSave,
  submission,
}: {
  record: ScreeningRecord
  onClose: () => void
  onSave: (draft: ReviewDraft) => void
  submission: ReviewSubmission
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const decision = latestReview(record)!
  return (
    <dialog
      ref={ref}
      className="sq-review-dialog"
      aria-labelledby="sq-dialog-title"
      onCancel={(event) => {
        if (submission.saving) event.preventDefault()
        else onClose()
      }}
      onClick={(event) => {
        if (!submission.saving && event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect()
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
        }
      }}
    >
      <div className="sq-dialog-heading">
        <div>
          <h2 id="sq-dialog-title">Add a new review</h2>
          <p>{record.displayName}</p>
        </div>
        <button className="sq-close" onClick={onClose} disabled={submission.saving} aria-label="Close new review">
          ×
        </button>
      </div>
      <div className="sq-current-decision">
        <h3>CURRENT DECISION</h3>
        <Badge tone={reviewStatus(decision)}>{decisionLabel(record, decision)}</Badge>
        <p>“{decision.note}”</p>
      </div>
      <DecisionForm outcome={record.outcome} onSave={onSave} submission={submission} modal />
    </dialog>
  )
}
