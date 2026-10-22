import { useState, type FormEvent } from 'react'
import { entryName, formatDate, listTypes, maskedPassport, type WatchlistEntry } from '../watchlist.types'
import { WatchlistDialog } from './WatchlistDialog'
import { nationalityLabel } from '../nationalities'

export function ClearEntryModal({
  entry,
  onCancel,
  onClear,
}: {
  entry: WatchlistEntry
  onCancel: () => void
  onClear: (reason: string) => void
}) {
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = String(new FormData(event.currentTarget).get('clearReason') ?? '').trim()
    if (!reason) {
      setError('Enter a reason for clearing this entry.')
      return
    }
    onClear(reason)
  }
  return (
    <WatchlistDialog title="Clear this watchlist entry?" onClose={onCancel} compact>
      <form className="wl-form" onSubmit={submit}>
        <p>Cleared entries stay on record but stop matching at booking and check-in. You can reactivate it later.</p>
        <p className="wl-summary-label">Entry to clear</p>
        <div className="wl-entry-summary">
          <p>
            {listTypes[entry.listType]} · {entry.issuingAuthority} · listed {formatDate(entry.listedAt)}
          </p>
          <strong>{entryName(entry)}</strong>
          <p>
            {formatDate(entry.dateOfBirth)} · {entry.nationality ? nationalityLabel(entry.nationality) : '—'} · passport{' '}
            {maskedPassport(entry.passportNumber)}
          </p>
        </div>
        <label>
          Reason for clearing (required)
          <textarea name="clearReason" placeholder="e.g. Authority withdrew the case on 10 Nov" required maxLength={2000} />
        </label>
        {error && (
          <p className="wl-error" role="alert">
            {error}
          </p>
        )}
        <p className="wl-help">Your name, the time and this reason are recorded on the entry and in Feature 15’s audit log.</p>
        <div className="wl-form-actions">
          <span className="wl-spacer" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="wl-danger" type="submit">
            Clear entry
          </button>
        </div>
      </form>
    </WatchlistDialog>
  )
}
