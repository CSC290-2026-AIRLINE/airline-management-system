import { useEffect, useRef, useState } from 'react'
import type { Gender, IdentityCorrection, Person } from '../types'
import { EM_DASH, formatDateOfBirth, genderLabel, nationalityWithCode, parseInputDate, toInputDate } from '../lib/format'
import { COUNTRY_OPTIONS } from '../lib/countries'
import { Select } from './Select'

/**
 * "Correct identity" — the only write action in this feature.
 *
 * Desktop renders it as a centred modal over a dimmed backdrop; mobile renders
 * the same fields as a bottom sheet. Both share this form and its validation.
 *
 * The dialog only reports the *edits* it made. The page merges them with the
 * person's current record, because `PUT /api/staff/passengers/:id/identity` restates
 * the whole identity rather than accepting a partial patch.
 */

const GENDER_OPTIONS = [
  { value: 'nochange' as const, label: 'No change' },
  { value: 'F' as const, label: 'F · Female' },
  { value: 'M' as const, label: 'M · Male' },
  { value: 'X' as const, label: 'X · Unspecified' },
]

const NATIONALITY_DROPDOWN = [
  { value: 'nochange' as const, label: 'No change' },
  // Every country, each carrying the lower-case two-letter code the API stores.
  // There is no free-text "Other…": the API only accepts a country code, and every
  // code is listed — see `lib/countries.ts`.
  ...COUNTRY_OPTIONS,
]

const REASON_MIN_LENGTH = 10

interface CorrectIdentityDialogProps {
  person: Person
  variant: 'desktop' | 'mobile'
  /** True while the save is in flight; the form is disabled until it settles. */
  saving?: boolean
  /** A failed save, surfaced here so the dialog stays open with the input intact. */
  saveError?: string | null
  onClose: () => void
  onSave: (correction: IdentityCorrection) => void
}

interface FormErrors {
  dateOfBirth?: string
  reason?: string
  confirmed?: string
  change?: string
}

export function CorrectIdentityDialog({ person, variant, saving = false, saveError = null, onClose, onSave }: CorrectIdentityDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const [dateInput, setDateInput] = useState(() => toInputDate(person.dateOfBirth))
  const [gender, setGender] = useState<'nochange' | Gender>('nochange')
  const [nationality, setNationality] = useState<string>('nochange')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => previouslyFocused?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // An empty field means "leave this value as it is", which is also the state a
  // passenger with no date of birth on record starts in.
  const dateIsBlank = dateInput.trim() === ''
  const parsedDate = dateIsBlank ? null : parseInputDate(dateInput)
  const dateChanged = dateIsBlank ? person.dateOfBirth !== null : parsedDate !== person.dateOfBirth
  const genderChanged = gender !== 'nochange' && gender !== person.gender
  const nationalityChanged = nationality !== 'nochange' && nationality !== person.nationality
  const hasChange = dateChanged || genderChanged || nationalityChanged

  function validate(): FormErrors {
    const next: FormErrors = {}
    // Only a field the staff member actually typed into can be malformed.
    if (!dateIsBlank && parsedDate === null) {
      next.dateOfBirth = 'Use the format DD / MM / YYYY, e.g. 21 / 08 / 1992.'
    }
    if (reason.trim().length < REASON_MIN_LENGTH) {
      next.reason = `Give a short reason (at least ${REASON_MIN_LENGTH} characters) for the audit log.`
    }
    if (!confirmed) {
      next.confirmed = 'Confirm you checked the values against the passport.'
    }
    if (!hasChange) {
      next.change = 'Change at least one value before saving.'
    }
    return next
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) {
      return
    }

    onSave({
      ...(dateChanged ? { dateOfBirth: dateIsBlank ? null : parsedDate } : {}),
      // `genderChanged` already guarantees `gender !== 'nochange'`; TypeScript
      // narrows through the alias, so re-testing it here is a type error.
      ...(genderChanged ? { gender } : {}),
      ...(nationalityChanged ? { nationality } : {}),
      reason: reason.trim(),
    })
  }

  const isMobile = variant === 'mobile'

  return (
    <div className={`cs-overlay ${isMobile ? 'is-sheet' : ''}`}>
      <button type="button" className="cs-overlay__backdrop" onClick={onClose} aria-label="Close without saving" tabIndex={-1} />
      <div className="cs-dialog" role="dialog" aria-modal="true" aria-labelledby="cs-correct-identity-title" ref={dialogRef} tabIndex={-1}>
        <form onSubmit={handleSubmit} noValidate>
          <header className="cs-dialog__header">
            <h2 className="cs-dialog__title" id="cs-correct-identity-title">
              {isMobile ? 'Correct identity' : `Correct identity · ${person.firstName} ${person.lastName}`}
            </h2>
            <p className="cs-dialog__subtitle">
              {isMobile
                ? `${person.firstName} ${person.lastName} · Fix a mistake in date of birth, gender or nationality. Check the passport first.`
                : 'Fix a mistake in date of birth, gender or nationality. Check it against the passport first.'}
            </p>
          </header>

          <div className="cs-dialog__body">
            {isMobile ? (
              <div className="cs-fields">
                <div className="cs-fields__row">
                  <div className="cs-fields__head">
                    <span className="cs-fields__label">Date of birth</span>
                    <span className="cs-fields__now">Now: {formatDateOfBirth(person.dateOfBirth)}</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`cs-input ${errors.dateOfBirth ? 'is-invalid' : ''}`}
                    value={dateInput}
                    onChange={(event) => {
                      setDateInput(event.target.value)
                      if (errors.dateOfBirth) setErrors((prev) => ({ ...prev, dateOfBirth: undefined }))
                    }}
                    aria-label="Corrected date of birth"
                    aria-invalid={Boolean(errors.dateOfBirth)}
                  />
                  {errors.dateOfBirth ? <FieldError message={errors.dateOfBirth} /> : null}
                </div>

                <div className="cs-fields__row">
                  <div className="cs-fields__head">
                    <span className="cs-fields__label">Gender</span>
                    <span className="cs-fields__now">Now: {currentGender(person)}</span>
                  </div>
                  <Select value={gender} options={GENDER_OPTIONS} onChange={setGender} ariaLabel="Corrected gender" />
                </div>

                <div className="cs-fields__row">
                  <div className="cs-fields__head">
                    <span className="cs-fields__label">Nationality</span>
                    <span className="cs-fields__now">Now: {nationalityWithCode(person.nationality)}</span>
                  </div>
                  <Select value={nationality} options={NATIONALITY_DROPDOWN} onChange={setNationality} ariaLabel="Corrected nationality" />
                </div>
              </div>
            ) : (
              <table className="cs-correct">
                <caption className="cs-visually-hidden">Correctable identity fields</caption>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Current</th>
                    <th scope="col">Corrected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Date of birth</th>
                    <td>{formatDateOfBirth(person.dateOfBirth)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={`cs-input ${errors.dateOfBirth ? 'is-invalid' : ''}`}
                        value={dateInput}
                        onChange={(event) => {
                          setDateInput(event.target.value)
                          if (errors.dateOfBirth) setErrors((prev) => ({ ...prev, dateOfBirth: undefined }))
                        }}
                        aria-label="Corrected date of birth"
                        aria-invalid={Boolean(errors.dateOfBirth)}
                      />
                      {errors.dateOfBirth ? <FieldError message={errors.dateOfBirth} /> : null}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Gender</th>
                    <td>{currentGender(person)}</td>
                    <td>
                      <Select value={gender} options={GENDER_OPTIONS} onChange={setGender} ariaLabel="Corrected gender" />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Nationality</th>
                    <td>{nationalityWithCode(person.nationality)}</td>
                    <td>
                      <Select
                        value={nationality}
                        options={NATIONALITY_DROPDOWN}
                        onChange={setNationality}
                        ariaLabel="Corrected nationality"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            <div className="cs-dialog__reason">
              <label className="cs-label" htmlFor="cs-reason">
                Reason (required)
              </label>
              <textarea
                id="cs-reason"
                className={`cs-textarea ${errors.reason ? 'is-invalid' : ''}`}
                placeholder="e.g. Day and month were swapped at booking; passport checked at counter"
                value={reason}
                rows={2}
                onChange={(event) => {
                  setReason(event.target.value)
                  if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }))
                }}
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'cs-reason-error' : undefined}
              />
              {errors.reason ? <FieldError id="cs-reason-error" message={errors.reason} /> : null}
            </div>

            <label className="cs-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => {
                  setConfirmed(event.target.checked)
                  if (errors.confirmed) setErrors((prev) => ({ ...prev, confirmed: undefined }))
                }}
              />
              <span>I checked the new values against the passenger’s passport.</span>
            </label>
            {errors.confirmed ? <FieldError message={errors.confirmed} /> : null}
            {errors.change ? <FieldError message={errors.change} /> : null}

            {/* A rejected save is the API's message, not a field error: the dialog stays open with everything typed in. */}
            {saveError ? <FieldError message={saveError} /> : null}
          </div>

          <footer className="cs-dialog__footer">
            <button type="button" className="cs-btn cs-btn--outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cs-btn cs-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save correction'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p className="cs-field-error" id={id} role="alert">
      {message}
    </p>
  )
}

/** `F · Female`, or an em dash when the passenger has no gender on record. */
function currentGender(person: Person): string {
  return person.gender ? `${person.gender} · ${genderLabel(person.gender)}` : EM_DASH
}
