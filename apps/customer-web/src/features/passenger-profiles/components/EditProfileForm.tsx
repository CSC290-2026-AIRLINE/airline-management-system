import { useState, type FormEvent } from 'react'
import { birthDateLabel, useProfile } from '@customer-web/features/passenger-profiles/profile-context'
import ProfileAvatar from '@customer-web/features/passenger-profiles/components/ProfileAvatar'
import UploadPhotoDialog from '@customer-web/features/passenger-profiles/components/UploadPhotoDialog'
import RemovePhotoDialog from '@customer-web/features/passenger-profiles/components/RemovePhotoDialog'
import ChangeEmailDialog from '@customer-web/features/passenger-profiles/components/ChangeEmailDialog'
import removeIcon from '@customer-web/features/passenger-profiles/assets/remove.svg'
import { errorMessage } from '../profile-api'

export default function EditProfileForm({ onDone }: { onDone: () => void }) {
  const { profile, updateProfile } = useProfile()
  const [draft, setDraft] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    localFirstName: profile.localFirstName,
    localLastName: profile.localLastName,
    passportNumber: profile.passportNumber,
    phone: profile.phone,
    photo: profile.photo,
  })
  const [photoFile, setPhotoFile] = useState<File | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<'upload' | 'remove' | 'email' | null>(null)
  const [error, setError] = useState('')
  const fullName = `${profile.firstName} ${profile.lastName}`
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Enter your first and last name.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateProfile(
        {
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          localFirstName: draft.localFirstName.trim(),
          localLastName: draft.localLastName.trim(),
          passportNumber: draft.passportNumber.trim(),
          phone: draft.phone.trim(),
        },
        photoFile,
      )
      onDone()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <section className="profile-card profile-editing" aria-labelledby="edit-profile-title">
        <header className="profile-card-header profile-editing-header">
          <div>
            <h2 id="edit-profile-title">Edit profile details</h2>
            <p>You can change your names, passport and phone. Date of birth, gender and nationality are locked after their first save.</p>
          </div>
        </header>
        <div className="profile-mobile-identity">
          <ProfileAvatar name={fullName} photo={draft.photo} />
          <div>
            <h2>{fullName}</h2>
            <p>{profile.email}</p>
          </div>
        </div>
        <form onSubmit={save} className="profile-edit-form">
          <div className="profile-edit-body">
            <div className="profile-edit-fields">
              <label className="profile-field profile-first-name">
                First name (passport spelling)
                <input
                  name="firstName"
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  disabled={saving}
                  value={draft.firstName}
                  onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                />
                <small>Use the Latin spelling printed on your passport. Enter Thai names in the local-name fields.</small>
              </label>
              <label className="profile-field profile-last-name">
                Last name
                <input
                  name="lastName"
                  autoComplete="family-name"
                  required
                  maxLength={80}
                  disabled={saving}
                  value={draft.lastName}
                  onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                />
              </label>
              <label className="profile-field">
                Local first name (optional)
                <input
                  maxLength={80}
                  value={draft.localFirstName}
                  disabled={saving}
                  onChange={(event) => setDraft({ ...draft, localFirstName: event.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="profile-field">
                Local last name (optional)
                <input
                  maxLength={80}
                  value={draft.localLastName}
                  disabled={saving}
                  onChange={(event) => setDraft({ ...draft, localLastName: event.target.value })}
                  autoComplete="off"
                />
              </label>
              <label className="profile-field">
                Passport number (optional)
                <input
                  maxLength={30}
                  value={draft.passportNumber}
                  disabled={saving}
                  onChange={(event) => setDraft({ ...draft, passportNumber: event.target.value })}
                  autoComplete="off"
                />
                <small>Letters and digits only; spaces and hyphens are removed when saved.</small>
              </label>
              <div className="profile-field profile-edit-email">
                <span>Email · managed by your sign-in account</span>
                <div className="profile-readonly-email">
                  <span>{profile.email}</span>
                  <button className="profile-link" type="button" disabled={saving} onClick={() => setDialog('email')}>
                    Change<span className="profile-desktop"> email</span>
                  </button>
                </div>
                <small>A new email gets a 6-digit code and changes only after you confirm it.</small>
              </div>
              <label className="profile-field profile-edit-phone">
                Phone
                <input
                  name="phone"
                  autoComplete="tel"
                  type="tel"
                  maxLength={30}
                  disabled={saving}
                  pattern="\+?[0-9 \(\)\-]{7,30}"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </label>
              <div className="profile-locked-fields">
                {[
                  ['Date of birth', birthDateLabel(profile.dateOfBirth)],
                  ['Nationality', profile.nationality],
                  ['Gender', profile.gender],
                ]
                  .filter(([, value]) => value && value !== 'Not set')
                  .map(([label, value]) => (
                    <label key={label} className="profile-field">
                      <span>{label}</span>
                      <span className="profile-locked-input">
                        <input readOnly value={value} aria-label={`${label}, locked`} />
                        <span aria-hidden="true">🔒</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="profile-photo-column">
              <div className="profile-desktop">
                <ProfileAvatar name={fullName} photo={draft.photo} />
              </div>
              <div className="profile-photo-actions">
                <button
                  type="button"
                  className="profile-icon-button profile-button--danger"
                  aria-label="Remove profile photo"
                  disabled={saving || !draft.photo}
                  onClick={() => setDialog('remove')}
                >
                  <img src={removeIcon} alt="" />
                </button>
                <button type="button" className="profile-button" disabled={saving} onClick={() => setDialog('upload')}>
                  Upload photo
                </button>
              </div>
            </div>
          </div>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <footer className="profile-edit-actions">
            <button type="button" className="profile-button profile-cancel" disabled={saving} onClick={onDone}>
              Cancel
            </button>
            <button className="profile-button profile-button--primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </footer>
        </form>
      </section>
      {dialog === 'upload' && (
        <UploadPhotoDialog
          onClose={() => setDialog(null)}
          onConfirm={(photo, file) => {
            setDraft((previous) => ({ ...previous, photo }))
            setPhotoFile(file)
            setDialog(null)
          }}
        />
      )}
      {dialog === 'remove' && (
        <RemovePhotoDialog
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDraft((previous) => ({ ...previous, photo: null }))
            setPhotoFile(null)
            setDialog(null)
          }}
        />
      )}
      {dialog === 'email' && <ChangeEmailDialog onClose={() => setDialog(null)} />}
    </>
  )
}
