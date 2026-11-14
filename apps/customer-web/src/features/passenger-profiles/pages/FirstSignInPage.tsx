import { useState, type FormEvent } from 'react'
import { useUser } from '@clerk/clerk-react'
import { ArrowRight, Lock } from 'lucide-react'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { cn } from '@customer-web/lib/utils'
import AccountPage from '../components/AccountPage'
import BirthDateInput from '../components/BirthDateInput'
import FormError from '../components/FormError'
import FormField from '../components/FormField'
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
  const steps = [
    { label: `Signed in${google ? ' with Google' : ''}`, state: 'done' },
    { label: 'Your details', state: 'current' },
    { label: 'My Profile', state: 'next' },
  ] as const
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!draft.gender) {
      setError('Select a gender.')
      return
    }
    if (!draft.nationality) {
      setError('Choose a nationality from the list.')
      return
    }
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
    <AccountPage className="max-w-xl">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" aria-label="Account setup progress">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2" aria-current={step.state === 'current' ? 'step' : undefined}>
            {index > 0 && <ArrowRight className="size-3" aria-hidden="true" />}
            <span className={cn(step.state === 'current' && 'font-semibold text-foreground', step.state === 'done' && 'text-foreground')}>
              {index + 1}&nbsp; {step.label}
            </span>
          </li>
        ))}
      </ol>
      <Card aria-labelledby="first-sign-in-title">
        <CardHeader>
          <CardTitle id="first-sign-in-title" role="heading" aria-level={1} className="text-xl">
            Welcome{greeting ? `, ${greeting}` : ''} — one more step
          </CardTitle>
          <CardDescription>
            We need these for every ticket and for airport checks. Your sign-in provider doesn’t share them with us.
          </CardDescription>
        </CardHeader>
        <form onSubmit={submit} aria-busy={busy} className="grid gap-6">
          <CardContent className="grid gap-4">
            {needsNames && (
              <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="First name (passport spelling)">
                    {({ id }) => (
                      <Input
                        id={id}
                        required
                        maxLength={80}
                        autoComplete="given-name"
                        value={draft.firstName}
                        disabled={busy}
                        onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                      />
                    )}
                  </FormField>
                  <FormField label="Last name (passport spelling)">
                    {({ id }) => (
                      <Input
                        id={id}
                        required
                        maxLength={80}
                        autoComplete="family-name"
                        value={draft.lastName}
                        disabled={busy}
                        onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                      />
                    )}
                  </FormField>
                </div>
              </div>
            )}
            <FormField label="Date of birth">
              {({ id }) => (
                <BirthDateInput
                  id={id}
                  value={draft.dateOfBirth}
                  onChange={(dateOfBirth) => setDraft({ ...draft, dateOfBirth })}
                  onError={setError}
                  readOnly={!!profile.dateOfBirth}
                  disabled={busy}
                  describedBy="setup-lock-warning"
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Gender">
                {({ id }) => (
                  <Select
                    required
                    name="gender"
                    value={draft.gender}
                    disabled={busy || !!profile.gender}
                    onValueChange={(gender) => setDraft({ ...draft, gender })}
                  >
                    <SelectTrigger id={id} aria-describedby="setup-lock-warning" className="w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(genderCodes).map(([label, code]) => (
                        <SelectItem key={code} value={code}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <NationalitySelect
                value={draft.nationality}
                disabled={busy || !!profile.nationality}
                onChange={(nationality) => setDraft((current) => ({ ...current, nationality }))}
              />
            </div>
            <Alert id="setup-lock-warning" role="note">
              <Lock aria-hidden="true" />
              <AlertDescription>
                These lock after you save. If something is wrong later, contact support — only staff can correct them.
              </AlertDescription>
            </Alert>
            {error && <FormError>{error}</FormError>}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? 'Saving…' : 'Save and go to My Profile'}
              {!busy && <ArrowRight />}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AccountPage>
  )
}
