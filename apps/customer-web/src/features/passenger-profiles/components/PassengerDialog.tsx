import { useState, type FormEvent } from 'react'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import BirthDateInput from '@customer-web/features/passenger-profiles/components/BirthDateInput'
import { birthDateLabel, type Passenger } from '@customer-web/features/passenger-profiles/profile-context'
import { errorMessage, nationalityOptions, nationalityCode, nationalityLabel } from '../profile-api'

const relationships = ['Spouse', 'Parent', 'Child', 'Sibling', 'Guardian', 'Companion', 'Other']

export default function PassengerDialog({
  passenger,
  onClose,
  onSave,
}: {
  passenger?: Passenger
  onClose: () => void
  onSave: (passenger: Passenger) => Promise<void>
}) {
  const [draft, setDraft] = useState(() => {
    const [englishName = '', localName = ''] = passenger?.name.split(' · ') ?? []
    const [first = '', ...last] = englishName.split(' ')
    const [localFirst = '', ...localLast] = localName.split(' ')
    return {
      firstName: passenger?.firstName ?? first,
      lastName: passenger?.lastName ?? last.join(' '),
      localFirstName: passenger?.localFirstName ?? localFirst,
      localLastName: passenger?.localLastName ?? localLast.join(' '),
      relationship: passenger?.relationship ?? '',
      dateOfBirth: passenger ? birthDateLabel(passenger.dateOfBirth) : '',
      gender: passenger?.gender ?? '',
      nationality: passenger?.nationality ?? '',
      nationalityCode: passenger?.nationalityCode ?? nationalityCode(passenger?.nationality ?? ''),
      passportNumber: passenger?.passportNumber ?? '',
    }
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  function change(field: keyof typeof draft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setError('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Enter the first and last name as shown on the passport.')
      return
    }
    let dateOfBirth = passenger?.dateOfBirth ?? ''
    if (!passenger) {
      const parts = /^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/.exec(draft.dateOfBirth.trim())
      if (!parts) {
        setError('Enter the date of birth as DD / MM / YYYY.')
        return
      }
      const [, day, month, year] = parts
      const date = new Date(Number(year), Number(month) - 1, Number(day))
      if (
        Number(year) < 1900 ||
        date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day) ||
        date > new Date()
      ) {
        setError('Enter a valid date of birth in the past.')
        return
      }
      dateOfBirth = `${year}-${month}-${day}`
    }
    const firstName = draft.firstName.trim()
    const lastName = draft.lastName.trim()
    const localFirstName = draft.localFirstName.trim()
    const localLastName = draft.localLastName.trim()
    const localName = [localFirstName, localLastName].filter(Boolean).join(' ')
    setSaving(true)
    setError('')
    try {
      await onSave({
        id: passenger?.id ?? crypto.randomUUID(),
        firstName,
        lastName,
        localFirstName,
        localLastName,
        name: `${firstName} ${lastName}${localName ? ` · ${localName}` : ''}`,
        relationship: draft.relationship,
        dateOfBirth,
        gender: passenger?.gender ?? draft.gender,
        nationality: passenger?.nationality ?? nationalityLabel(draft.nationalityCode),
        nationalityCode: draft.nationalityCode,
        passportNumber: draft.passportNumber.trim(),
      })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <ProfileDialog
      title={passenger ? 'Edit saved passenger' : 'Add saved passenger'}
      onClose={() => {
        if (!saving) onClose()
      }}
      kind="profile-dialog--passenger"
    >
      <p className="passenger-intro">Save family and companions you book for.</p>
      <form className="profile-passenger-form" onSubmit={submit}>
        <label className="profile-field">
          Passenger’s relationship to you (optional)
          <select
            value={draft.relationship}
            onChange={(event) => change('relationship', event.target.value)}
            aria-describedby="passenger-relationship-hint"
          >
            <option value="">Not specified</option>
            {relationships.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <small id="passenger-relationship-hint">
            For example, Parent means this passenger is your parent. Your own details are in My Profile.
          </small>
        </label>
        <div className="passenger-form-row">
          <label className="profile-field">
            First name (passport spelling)
            <input
              required
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. SOMCHAI"
              value={draft.firstName}
              onChange={(event) => change('firstName', event.target.value)}
            />
          </label>
          <label className="profile-field">
            Last name
            <input
              required
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. SARANPAT"
              value={draft.lastName}
              onChange={(event) => change('lastName', event.target.value)}
            />
          </label>
        </div>
        <p className="profile-fine">Use the Latin names printed on their passport. Thai names belong in the optional local-name fields.</p>
        <div className="passenger-form-row">
          <label className="profile-field">
            Local first name (optional)
            <input
              maxLength={80}
              placeholder="e.g. สมชาย"
              value={draft.localFirstName}
              onChange={(event) => change('localFirstName', event.target.value)}
            />
          </label>
          <label className="profile-field">
            Local last name (optional)
            <input
              maxLength={80}
              placeholder="e.g. สารพัฒน์"
              value={draft.localLastName}
              onChange={(event) => change('localLastName', event.target.value)}
            />
          </label>
        </div>
        <div className="passenger-form-row passenger-form-row--three">
          <label className="profile-field">
            Date of birth
            <BirthDateInput
              value={draft.dateOfBirth}
              onChange={(dateOfBirth) => change('dateOfBirth', dateOfBirth)}
              onError={setError}
              readOnly={!!passenger}
              describedBy="passenger-lock-note"
            />
          </label>
          <label className="profile-field">
            Gender
            <select
              required
              disabled={!!passenger}
              value={draft.gender}
              onChange={(event) => change('gender', event.target.value)}
              aria-describedby="passenger-lock-note"
            >
              <option value="" disabled>
                Select ▾
              </option>
              {['Female', 'Male', 'Other / unspecified'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="profile-field">
            Nationality
            <select
              required
              disabled={!!passenger}
              value={draft.nationalityCode}
              onChange={(event) => change('nationalityCode', event.target.value)}
              aria-describedby="passenger-lock-note"
            >
              <option value="" disabled>
                Select ▾
              </option>
              {[
                ...nationalityOptions,
                ...(!nationalityOptions.some(([code]) => code === draft.nationalityCode) && draft.nationalityCode
                  ? [[draft.nationalityCode, draft.nationality]]
                  : []),
              ].map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="profile-field">
          Passport number (optional)
          <input
            maxLength={30}
            autoComplete="off"
            placeholder="If known"
            value={draft.passportNumber}
            onChange={(event) => change('passportNumber', event.target.value)}
          />
        </label>
        <p id="passenger-lock-note" className="passenger-lock-note">
          🔒 Date of birth, gender and nationality can’t be changed after saving.
        </p>
        {error && (
          <p role="alert" className="profile-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" className="profile-button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="profile-button profile-button--primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save passenger'}
          </button>
        </footer>
      </form>
    </ProfileDialog>
  )
}
