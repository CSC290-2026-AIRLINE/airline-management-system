import { useState, type FormEvent } from 'react'
import { listTypes, type EntryFields, type WatchlistEntry } from '../watchlist.types'
import { WatchlistSelect } from './WatchlistSelect'
import { NationalitySelect } from './NationalitySelect'
import { isNationalityCode } from '../nationalities'

function inputDate(value?: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day} / ${month} / ${year}`
}

function parseDate(value: string) {
  const match = /^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/.exec(value)
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso && date <= new Date() ? iso : null
}

export function WatchlistEntryForm({
  entry,
  onSave,
  onCancel,
  onClear,
}: {
  entry?: WatchlistEntry
  onSave: (fields: EntryFields) => Promise<void>
  onCancel: () => void
  onClear: () => void
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [listType, setListType] = useState(entry?.listType ?? '')
  const [nationality, setNationality] = useState(entry?.nationality ?? '')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) ?? '').trim()
    if (!value('firstName') || !value('lastName') || !value('issuingAuthority')) {
      setError('Enter a first name, last name and issuing authority. Blank spaces are not accepted.')
      return
    }
    if (listType !== 'wanted' && listType !== 'travel_ban' && listType !== 'no_fly') {
      setError('Select a list type.')
      return
    }
    const dateOfBirth = value('dateOfBirth') ? parseDate(value('dateOfBirth')) : ''
    if (dateOfBirth === null) {
      setError('Enter a valid date of birth as DD / MM / YYYY, no later than today.')
      return
    }
    const passportNumber = value('passportNumber')
    if (nationality && !isNationalityCode(nationality)) {
      setError('Select a nationality from the list.')
      return
    }
    if (passportNumber && !/^[A-Za-z0-9]{1,20}$/.test(passportNumber)) {
      setError('Use up to 20 letters and numbers for the passport.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSave({
        firstName: value('firstName').toUpperCase(),
        lastName: value('lastName').toUpperCase(),
        dateOfBirth,
        nationality,
        passportNumber: passportNumber.toUpperCase(),
        listType,
        issuingAuthority: value('issuingAuthority'),
        reason: value('reason'),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="wl-form">
      <fieldset className="wl-form-fields" disabled={submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <p>Use the spelling on the passport.</p>
        {error && (
          <p className="wl-error" role="alert">
            {error}
          </p>
        )}
        <div className="wl-form-row">
          <label>
            First name
            <input name="firstName" defaultValue={entry?.firstName} placeholder="e.g. SOMSAK" required maxLength={100} />
          </label>
          <label>
            Last name
            <input name="lastName" defaultValue={entry?.lastName} placeholder="e.g. JAIDEE" required maxLength={100} />
          </label>
        </div>
        <div className="wl-form-row wl-identity-row">
          <label>
            Date of birth
            <input
              name="dateOfBirth"
              defaultValue={inputDate(entry?.dateOfBirth)}
              placeholder="DD / MM / YYYY"
              inputMode="numeric"
              maxLength={14}
            />
          </label>
          <div className="wl-field">
            <span>Nationality</span>
            <NationalitySelect value={nationality} onChange={setNationality} />
          </div>
          <label>
            Passport number (optional)
            <input
              name="passportNumber"
              defaultValue={entry?.passportNumber ?? ''}
              placeholder="Optional"
              maxLength={20}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="wl-form-row">
          <div className="wl-field">
            <span>List type</span>
            <WatchlistSelect
              label="List type"
              name="listType"
              value={listType}
              onChange={setListType}
              field
              options={[{ value: '', label: 'Select list type' }, ...Object.entries(listTypes).map(([value, label]) => ({ value, label }))]}
            />
          </div>
          <label>
            Issuing authority
            <input
              name="issuingAuthority"
              defaultValue={entry?.issuingAuthority}
              placeholder="e.g. [Demo authority]"
              required
              maxLength={200}
            />
          </label>
        </div>
        <label>
          Reason
          <textarea name="reason" defaultValue={entry?.reason} placeholder="e.g. Case reference DEMO-0142" maxLength={2000} />
        </label>
        <p className="wl-help">Matching uses passport + nationality first (Strong), then name + date of birth (Probable).</p>
        {entry?.status === 'cleared' && <p className="wl-help">This entry is cleared. Saving changes keeps its cleared status.</p>}
        <div className="wl-form-actions">
          {entry?.status === 'active' && (
            <button type="button" className="wl-danger-outline" onClick={onClear}>
              Clear entry
            </button>
          )}
          <span className="wl-spacer" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="wl-primary" type="submit">
            {submitting ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
