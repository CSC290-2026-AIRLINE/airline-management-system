import { useState, type FormEvent } from 'react'
import { useUser } from '@clerk/clerk-react'
import CustomerNavigation from '../components/CustomerNavigation'
import BirthDateInput from '../components/BirthDateInput'
import NationalitySelect from '../components/NationalitySelect'
import { parseBirthDateInput } from '../birth-date'
import { birthDateLabel, useProfile } from '../profile-context'
import { errorMessage, genderCodes, nationalityCode } from '../profile-api'

export default function FirstSignInPage() {
  const { profile, completeIdentitySetup } = useProfile()
  const { user } = useUser()
  const validName = (value: string) => /^[A-Za-z][A-Za-z .'-]*$/.test(value)
  const needsNames = !validName(profile.firstName) || !validName(profile.lastName)
  const [draft, setDraft] = useState({
    firstName: validName(profile.firstName) ? profile.firstName : '',
    lastName: validName(profile.lastName) ? profile.lastName : '',
    dateOfBirth: profile.dateOfBirth ? birthDateLabel(profile.dateOfBirth) : '',
    gender: genderCodes[profile.gender] ?? '',
    nationality: nationalityCode(profile.nationality),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const greeting = profile.firstName && !profile.firstName.includes('@') ? profile.firstName : user?.firstName || ''
  const google = user?.externalAccounts.some((account) => account.provider === 'google')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const birthDate = parseBirthDateInput(draft.dateOfBirth, new Date())
    if (birthDate.error) {
      setError(birthDate.error)
      return
    }
    setBusy(true)
    setError('')
    try {
      await completeIdentitySetup({
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        dateOfBirth: birthDate.dateOfBirth,
        gender: draft.gender,
        nationality: draft.nationality,
      })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="account-page first-sign-in-page">
      <CustomerNavigation />
      <section className="first-sign-in-card" aria-labelledby="first-sign-in-title">
        <ol className="first-sign-in-steps" aria-label="Account setup progress">
          <li className="setup-step-done">1&nbsp; Signed in{google ? ' with Google' : ''}</li>
          <li aria-hidden="true">→</li>
          <li className="setup-step-current" aria-current="step">
            2&nbsp; Your details
          </li>
          <li aria-hidden="true">→</li>
          <li className="setup-step-next">3&nbsp; My Profile</li>
        </ol>
        <h1 id="first-sign-in-title">Welcome{greeting ? `, ${greeting}` : ''} — one more step</h1>
        <p className="first-sign-in-intro">
          We need these for every ticket and for airport checks. Your sign-in provider doesn’t share them with us.
        </p>
        <form onSubmit={submit} className="first-sign-in-form" aria-busy={busy}>
          {needsNames && (
            <div className="first-sign-in-names">
              <label className="profile-field">
                First name (passport spelling)
                <input
                  required
                  maxLength={80}
                  autoComplete="given-name"
                  value={draft.firstName}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                />
              </label>
              <label className="profile-field">
                Last name (passport spelling)
                <input
                  required
                  maxLength={80}
                  autoComplete="family-name"
                  value={draft.lastName}
                  disabled={busy}
                  onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                />
              </label>
              <small className="profile-fine">Enter the Latin spelling printed on your passport.</small>
            </div>
          )}
          <label className="profile-field">
            Date of birth
            <BirthDateInput
              value={draft.dateOfBirth}
              onChange={(dateOfBirth) => setDraft({ ...draft, dateOfBirth })}
              onError={setError}
              readOnly={!!profile.dateOfBirth}
              disabled={busy}
              describedBy="setup-lock-warning"
            />
            <small>As shown on your passport</small>
          </label>
          <div className="first-sign-in-row">
            <label className="profile-field">
              Gender
              <select
                required
                value={draft.gender}
                className={draft.gender ? '' : 'setup-select-placeholder'}
                disabled={busy || !!profile.gender}
                onChange={(event) => setDraft({ ...draft, gender: event.target.value })}
                aria-describedby="setup-lock-warning"
              >
                <option value="" disabled>
                  Select ▾
                </option>
                {Object.entries(genderCodes).map(([label, code]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <NationalitySelect
              value={draft.nationality}
              disabled={busy || !!profile.nationality}
              onChange={(nationality) => setDraft((current) => ({ ...current, nationality }))}
            />
          </div>
          <p id="setup-lock-warning" className="first-sign-in-warning">
            <span aria-hidden="true">🔒</span>
            <span>These lock after you save. If something is wrong later, contact support — only staff can correct them.</span>
          </p>
          {error && (
            <p role="alert" className="profile-error">
              {error}
            </p>
          )}
          <footer>
            <button type="submit" disabled={busy} className="profile-button profile-button--primary">
              {busy ? 'Saving…' : 'Save and go to My Profile →'}
            </button>
          </footer>
        </form>
      </section>
    </main>
  )
}
