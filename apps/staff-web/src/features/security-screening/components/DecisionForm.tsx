import { useState } from 'react'
import type { Decision, Match } from '../types'

export function MatchNotice({ match }: { match: Match }) {
  const messages = {
    Probable: [
      'Probable match · check-in is held',
      'Name and date of birth match, but the passport number is different. Check the passport in person before you decide.',
    ],
    Strong: [
      'Strong match · check-in is held',
      'Passport number and nationality equal an active watchlist entry. Only release the hold if the passport in person shows otherwise.',
    ],
    Weak: [
      'Weak match · check-in is not held',
      'Only the name is similar. Choosing “Same person” confirms the match, so her check-in will be denied.',
    ],
  }
  return (
    <div className={`sq-match-notice sq-notice-${match.toLowerCase()}`}>
      <strong>{messages[match][0]}</strong>
      <p>
        <span className="sq-desktop-only">{messages[match][1]}</span>
        <span className="sq-mobile-only">
          {match === 'Probable'
            ? 'Name and date of birth match, but the passport number is different. Check the passport in person.'
            : messages[match][1]}
        </span>
      </p>
    </div>
  )
}

export function DecisionForm({ weak, onSave, modal = false }: { weak: boolean; onSave: (decision: Decision) => void; modal?: boolean }) {
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const noteInvalid = submitted && !note.trim()
  const checkInvalid = submitted && !checked
  function submit(status: Decision['status']) {
    setSubmitted(true)
    if (!note.trim() || !checked) return
    onSave({
      status,
      note: note.trim(),
      by: 'Administrator',
      at: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date()),
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
        <button type="button" className="sq-button" onClick={() => submit('Released')}>
          Not the same person{!modal && ` · ${weak ? 'clear flag' : 'release hold'}`}
        </button>
        <button type="button" className="sq-button sq-danger" onClick={() => submit('Confirmed')}>
          Same person{!modal && ' · confirm match'}
        </button>
      </div>
      <p className="sq-fine-print">
        {modal
          ? '“Same person” denies check-in and notifies the authority. Logged in Feature 15.'
          : weak
            ? 'Clearing the flag is remembered for this identity, flight and entry, so it isn’t flagged again.'
            : 'Same person keeps check-in denied and notifies the authority (Feature 13). Not the same person releases the hold and check-in continues.'}
      </p>
    </form>
  )
}
