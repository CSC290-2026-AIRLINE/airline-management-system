import { useState, type FormEvent } from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { DialogFooter } from '@customer-web/components/ui/dialog'
import { FieldGroup } from '@customer-web/components/ui/field'
import { Input } from '@customer-web/components/ui/input'
import { birthDateLabel, useProfile } from '@customer-web/features/passenger-profiles/profile-context'
import ChangeEmailDialog from '@customer-web/features/passenger-profiles/components/ChangeEmailDialog'
import FormError from '@customer-web/features/passenger-profiles/components/FormError'
import FormField from '@customer-web/features/passenger-profiles/components/FormField'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import ProfileAvatar from '@customer-web/features/passenger-profiles/components/ProfileAvatar'
import RemovePhotoDialog from '@customer-web/features/passenger-profiles/components/RemovePhotoDialog'
import UploadPhotoDialog from '@customer-web/features/passenger-profiles/components/UploadPhotoDialog'
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
  const lockedFields = [
    ['Date of birth', birthDateLabel(profile.dateOfBirth)],
    ['Nationality', profile.nationality],
    ['Gender', profile.gender],
  ].filter(([, value]) => value && value !== 'Not set')
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
      <ProfileDialog
        title="Edit profile details"
        onClose={() => {
          if (!saving) onDone()
        }}
        className="sm:max-w-2xl"
      >
        <p className="text-sm text-muted-foreground">Date of birth, gender and nationality can’t be changed.</p>
        <form onSubmit={save} className="grid gap-6">
          <div className="grid gap-6">
            <div className="flex items-center gap-4">
              <ProfileAvatar name={fullName} photo={draft.photo} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setDialog('upload')}>
                  Upload photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label="Remove profile photo"
                  disabled={saving || !draft.photo}
                  onClick={() => setDialog('remove')}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="First name (passport spelling)">
                  {({ id }) => (
                    <Input
                      id={id}
                      name="firstName"
                      autoComplete="given-name"
                      required
                      maxLength={80}
                      disabled={saving}
                      value={draft.firstName}
                      onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                    />
                  )}
                </FormField>
                <FormField label="Last name">
                  {({ id }) => (
                    <Input
                      id={id}
                      name="lastName"
                      autoComplete="family-name"
                      required
                      maxLength={80}
                      disabled={saving}
                      value={draft.lastName}
                      onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                    />
                  )}
                </FormField>
                <FormField label="Local first name (optional)">
                  {({ id }) => (
                    <Input
                      id={id}
                      maxLength={80}
                      autoComplete="off"
                      disabled={saving}
                      value={draft.localFirstName}
                      onChange={(event) => setDraft({ ...draft, localFirstName: event.target.value })}
                    />
                  )}
                </FormField>
                <FormField label="Local last name (optional)">
                  {({ id }) => (
                    <Input
                      id={id}
                      maxLength={80}
                      autoComplete="off"
                      disabled={saving}
                      value={draft.localLastName}
                      onChange={(event) => setDraft({ ...draft, localLastName: event.target.value })}
                    />
                  )}
                </FormField>
              </div>
              <FormField label="Passport number (optional)">
                {({ id }) => (
                  <Input
                    id={id}
                    maxLength={30}
                    autoComplete="off"
                    disabled={saving}
                    value={draft.passportNumber}
                    onChange={(event) => setDraft({ ...draft, passportNumber: event.target.value })}
                  />
                )}
              </FormField>
              <FormField label="Email · managed by your sign-in account">
                {({ id }) => (
                  <div className="flex items-center gap-2">
                    <Input id={id} readOnly disabled value={profile.email} />
                    <Button type="button" variant="outline" disabled={saving} onClick={() => setDialog('email')}>
                      <span>
                        Change<span className="hidden sm:inline"> email</span>
                      </span>
                    </Button>
                  </div>
                )}
              </FormField>
              <FormField label="Phone">
                {({ id }) => (
                  <Input
                    id={id}
                    name="phone"
                    autoComplete="tel"
                    type="tel"
                    maxLength={30}
                    disabled={saving}
                    pattern="\+?[0-9 \(\)\-]{7,30}"
                    value={draft.phone}
                    onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  />
                )}
              </FormField>
              {lockedFields.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-3">
                  {lockedFields.map(([label, value]) => (
                    <FormField key={label} label={label}>
                      {({ id }) => (
                        <div className="relative">
                          <Input id={id} readOnly value={value} aria-label={`${label}, locked`} className="pr-9" />
                          <Lock className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                    </FormField>
                  ))}
                </div>
              )}
            </FieldGroup>
            {error && <FormError>{error}</FormError>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </ProfileDialog>
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
