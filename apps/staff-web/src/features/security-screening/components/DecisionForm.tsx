import { useState } from 'react'
import type { ReviewDecision, ReviewDraft, ScreeningOutcome, ScreeningRecord } from '../types'

export function MatchNotice({ record }: { record: ScreeningRecord }) {
  if (record.outcome === 'clear') return null
  const { match, outcome } = record
  const description =
    match === 'Strong'
      ? outcome === 'held'
        ? 'Passport number and nationality equal an active watchlist entry. Only release the hold if the passport in person shows otherwise.'
        : 'Passport number and nationality equal an active watchlist entry. Nothing is held yet. Check the passport in person before you decide.'
      : match === 'Probable'
        ? record.matchReason === 'passport'
          ? 'Passport number matches, but nationality is different or missing. Check the passport in person before you decide.'
          : 'Name and date of birth match, but the passport number is different. Check the passport in person before you decide.'
        : 'Only the name is similar. Choosing “Same person” confirms the match, so check-in will be denied.'
  const mobileDescription =
    record.matchReason === 'name_and_dob'
      ? 'Name and date of birth match, but the passport number is different. Check the passport in person.'
      : description
  return (
    <div className={`sq-match-notice sq-notice-${match.toLowerCase()}`}>
      <strong>
        {match} match · {outcome === 'held' ? 'check-in is held' : 'check-in is not held'}
      </strong>
      <p>
        <span className="sq-desktop-only">{description}</span>
        <span className="sq-mobile-only">{mobileDescription}</span>
      </p>
    </div>
  )
}

export function DecisionForm({
  outcome,
  onSave,
  modal = false,
}: {
  outcome: ScreeningOutcome
  onSave: (draft: ReviewDraft) => void
  modal?: boolean
}) {
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const noteInvalid = submitted && !note.trim()
  const checkInvalid = submitted && !checked
  function submit(decision: ReviewDecision) {
    setSubmitted(true)
    if (!note.trim() || !checked) return
    onSave({
      decision,
      note: note.trim(),
      passportCompared: checked,
    })
  }
  return (
    <form className={`sq-decision-form ${modal ? 'sq-modal-form' : ''}`} onSubmit={(event) => event.preventDefault()} noValidate>
      <label className="sq-note-label">
        Note (required)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={modal ? 'Why the earlier decision was wrong' : 'What you compared, e.g. passport number differs'}
          aria-invalid={noteInvalid}
          aria-describedby={noteInvalid ? 'sq-note-error' : undefined}
          required
        />
      </label>
      {noteInvalid && (
        <p className="sq-error" id="sq-note-error" role="alert">
          Write what you compared before you decide. The note is saved with the review.
        </p>
      )}
      <label className="sq-check-label">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          aria-invalid={checkInvalid}
          aria-describedby={checkInvalid ? 'sq-check-error' : undefined}
        />
        <span>{modal ? 'I compared the passport in person.' : 'I compared the passport in person or with the agent at the counter.'}</span>
      </label>
      {checkInvalid && (
        <p className="sq-error" id="sq-check-error" role="alert">
          Confirm that you compared the passport before you decide.
        </p>
      )}
      <div className="sq-decision-actions">
        <button type="button" className="sq-button" onClick={() => submit('false_positive')}>
          Not the same person{!modal && ` · ${outcome === 'held' ? 'release hold' : 'clear flag'}`}
        </button>
        <button type="button" className="sq-button sq-danger" onClick={() => submit('confirmed')}>
          Same person{!modal && ' · confirm match'}
        </button>
      </div>
      {(modal || outcome === 'flagged') && (
        <p
          className="sq-fine-print"
          title="Frontend prototype: notification delivery and audit integration are mocked. A review applies to this check only; other unresolved matches may still block check-in."
        >
          {modal
            ? '“Same person” denies check-in and notifies the authority. Logged in Feature 15.'
            : 'Clearing the flag is remembered for this identity, flight and entry, so it isn’t flagged again.'}
        </p>
      )}
    </form>
  )
}
