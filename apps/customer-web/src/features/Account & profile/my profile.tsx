import { useState } from 'react'
import EditProfile from './edit profile'
import { birthDateLabel, useProfile } from './profile-context'
import ProfileAvatar from './components/ProfileAvatar'
import SavedPassengers from './components/SavedPassengers'
import ChangeEmailDialog from './components/ChangeEmailDialog'
import editIcon from './assets/edit-profile.svg'

export default function MyProfile() {
  const { profile } = useProfile()
  const [changeEmail, setChangeEmail] = useState(false)
  const [editing, setEditing] = useState(false)
  const fullName = `${profile.firstName} ${profile.lastName}`
  const lockedRows = [
    ['Date of birth', birthDateLabel(profile.dateOfBirth)],
    ['Nationality', profile.nationality],
    ['Gender', profile.gender],
  ]
  return (
    <main className="account-page">
      <div className="account-content">
        <header className="account-heading">
          <h1>My Profile</h1>
          <p>Manage your details, saved passengers and profile photo.</p>
        </header>
        {editing ? (
          <EditProfile onDone={() => setEditing(false)} />
        ) : (
          <section className="profile-card profile-details" aria-labelledby="profile-title">
            <header className="profile-card-header profile-details-header">
              <div>
                <h2 id="profile-title">Profile details</h2>
                <p>Date of birth, gender and nationality are locked after setup. Email is managed by your sign-in account.</p>
              </div>
              <button type="button" className="profile-button profile-edit-link" onClick={() => setEditing(true)}>
                <img src={editIcon} alt="" />
                <span className="profile-desktop">Edit profile</span>
                <span className="profile-sr-only profile-mobile">Edit profile</span>
              </button>
            </header>
            <div className="profile-details-body">
              <div className="profile-mobile-identity">
                <ProfileAvatar name={fullName} photo={profile.photo} />
                <div>
                  <h2>{fullName}</h2>
                  <p>{profile.email}</p>
                </div>
                <button type="button" className="profile-icon-button" onClick={() => setEditing(true)} aria-label="Edit profile">
                  <img src={editIcon} alt="" />
                </button>
              </div>
              <div className="profile-info-columns">
                <dl className="profile-info profile-contact-info">
                  <div className="profile-desktop">
                    <dt>First name</dt>
                    <dd>{profile.firstName}</dd>
                  </div>
                  <div className="profile-desktop">
                    <dt>Last name</dt>
                    <dd>{profile.lastName}</dd>
                  </div>
                  <div className="profile-email-row">
                    <dt>Email</dt>
                    <dd>{profile.email}</dd>
                    <button className="profile-link" onClick={() => setChangeEmail(true)}>
                      Change<span className="profile-desktop"> email</span>
                    </button>
                  </div>
                  <div className="profile-phone-row">
                    <dt>Phone</dt>
                    <dd>{profile.phone || 'Not set'}</dd>
                  </div>
                </dl>
                <dl className="profile-info">
                  {lockedRows.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                      <span className="profile-lock" aria-label="Locked">
                        🔒<span className="profile-desktop"> locked</span>
                      </span>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="profile-desktop profile-photo-column">
                <ProfileAvatar name={fullName} photo={profile.photo} />
              </div>
            </div>
          </section>
        )}
        <SavedPassengers />
        {changeEmail && <ChangeEmailDialog onClose={() => setChangeEmail(false)} />}
      </div>
    </main>
  )
}
