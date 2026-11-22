import { useState, type ReactNode } from 'react'
import { Lock, Pencil } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import AccountPage from '@customer-web/features/passenger-profiles/components/AccountPage'
import ChangeEmailDialog from '@customer-web/features/passenger-profiles/components/ChangeEmailDialog'
import EditProfileForm from '@customer-web/features/passenger-profiles/components/EditProfileForm'
import ProfileAvatar from '@customer-web/features/passenger-profiles/components/ProfileAvatar'
import SavedPassengers from '@customer-web/features/passenger-profiles/components/SavedPassengers'
import { birthDateLabel, useProfile } from '@customer-web/features/passenger-profiles/profile-context'

function InfoRow({ label, locked, children }: { label: string; locked?: boolean; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2">
        {children}
        {locked && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" aria-label="Locked" />
            <span className="hidden sm:inline">locked</span>
          </span>
        )}
      </dd>
    </div>
  )
}

export default function MyProfilePage() {
  const { profile } = useProfile()
  const [changeEmail, setChangeEmail] = useState(false)
  const [editing, setEditing] = useState(false)
  const fullName = `${profile.firstName} ${profile.lastName}`
  const lockedRows = [
    ['Date of birth', birthDateLabel(profile.dateOfBirth)],
    ['Nationality', profile.nationality || 'Not set'],
    ['Gender', profile.gender || 'Not set'],
  ]
  const localName = [profile.localFirstName, profile.localLastName].filter(Boolean).join(' ')
  return (
    <AccountPage>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">Manage your details, saved passengers and profile photo.</p>
      </header>
      <Card aria-labelledby="profile-title">
        <CardHeader>
          <CardTitle id="profile-title" role="heading" aria-level={2}>
            Profile details
          </CardTitle>
          <CardDescription>
            Date of birth, gender and nationality are locked after setup. Email is managed by your sign-in account.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit profile
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
          <div className="grid flex-1 gap-6 sm:grid-cols-2">
            <dl className="grid content-start gap-4">
              <InfoRow label="First name">{profile.firstName}</InfoRow>
              <InfoRow label="Last name">{profile.lastName}</InfoRow>
              <InfoRow label="Email">
                <span className="truncate" title={profile.email}>
                  {profile.email}
                </span>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setChangeEmail(true)}>
                  <span>
                    Change<span className="hidden sm:inline"> email</span>
                  </span>
                </Button>
              </InfoRow>
              <InfoRow label="Phone">{profile.phone || 'Not set'}</InfoRow>
              {localName && <InfoRow label="Local name">{localName}</InfoRow>}
              <InfoRow label="Passport">
                {profile.passportNumber
                  ? `${'•'.repeat(Math.max(profile.passportNumber.length - 4, 0))}${profile.passportNumber.slice(-4)}`
                  : 'Not set'}
              </InfoRow>
            </dl>
            <dl className="grid content-start gap-4">
              {lockedRows.map(([label, value]) => (
                <InfoRow key={label} label={label} locked={value !== 'Not set'}>
                  {value}
                </InfoRow>
              ))}
            </dl>
          </div>
          <ProfileAvatar name={fullName} photo={profile.photo} className="size-20 shrink-0 sm:size-28" />
        </CardContent>
      </Card>
      {editing && <EditProfileForm onDone={() => setEditing(false)} />}
      <SavedPassengers />
      {changeEmail && <ChangeEmailDialog onClose={() => setChangeEmail(false)} />}
    </AccountPage>
  )
}
