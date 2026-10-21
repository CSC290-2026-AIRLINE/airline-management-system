import { useState, type FormEvent } from 'react'
import { birthDateLabel, useProfile } from './profile-context'
import ProfileAvatar from './components/ProfileAvatar'
import UploadPhotoDialog from './components/UploadPhotoDialog'
import RemovePhotoDialog from './components/RemovePhotoDialog'
import ChangeEmailDialog from './components/ChangeEmailDialog'
import removeIcon from './assets/remove.svg'

export default function EditProfile({ onDone }: { onDone: () => void }) {
  const { profile, updateProfile } = useProfile()
  const [draft, setDraft] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    photo: profile.photo,
  })
  const [dialog, setDialog] = useState<'upload' | 'remove' | 'email' | null>(null)
  const [error, setError] = useState('')
  const fullName = `${profile.firstName} ${profile.lastName}`
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Enter your first and last name.')
      return
    }
    updateProfile({ firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), phone: draft.phone.trim(), photo: draft.photo })
    onDone()
  }
  return (
    <>
      <section className="profile-card profile-editing" aria-labelledby="edit-profile-title">
        <header className="profile-card-header profile-editing-header">
          <div>
            <h2 id="edit-profile-title">Edit profile details</h2>
            <p>You can change your name and phone. Locked fields can only be corrected by staff.</p>
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
                First name
                <input
                  name="firstName"
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  value={draft.firstName}
                  onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                />
              </label>
              <label className="profile-field profile-last-name">
                Last name
                <input
                  name="lastName"
                  autoComplete="family-name"
                  required
                  maxLength={80}
                  value={draft.lastName}
                  onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                />
              </label>
              <div className="profile-field profile-edit-email">
                <span>Email · managed by your sign-in account</span>
                <div className="profile-readonly-email">
                  <span>{profile.email}</span>
                  <button className="profile-link" type="button" onClick={() => setDialog('email')}>
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
                  pattern="[+0-9 ()\-]{7,30}"
                  value={draft.phone}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                />
              </label>
              <div className="profile-locked-fields">
                {[
                  ['Date of birth', birthDateLabel(profile.dateOfBirth)],
                  ['Nationality', profile.nationality],
                  ['Gender', profile.gender],
                ].map(([label, value]) => (
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
                  onClick={() => setDialog('remove')}
                >
                  <img src={removeIcon} alt="" />
                </button>
                <button type="button" className="profile-button" onClick={() => setDialog('upload')}>
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
            <button type="button" className="profile-button profile-cancel" onClick={onDone}>
              Cancel
            </button>
            <button className="profile-button profile-button--primary" type="submit">
              Save changes
            </button>
          </footer>
        </form>
      </section>
      {dialog === 'upload' && (
        <UploadPhotoDialog
          onClose={() => setDialog(null)}
          onConfirm={(photo) => {
            setDraft((previous) => ({ ...previous, photo }))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'remove' && (
        <RemovePhotoDialog
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDraft((previous) => ({ ...previous, photo: null }))
            setDialog(null)
          }}
        />
      )}
      {dialog === 'email' && <ChangeEmailDialog onClose={() => setDialog(null)} />}
    </>
  )
}
