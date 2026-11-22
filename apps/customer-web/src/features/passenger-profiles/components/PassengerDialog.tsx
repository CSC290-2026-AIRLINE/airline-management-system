import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { DialogFooter } from '@customer-web/components/ui/dialog'
import { Input } from '@customer-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import BirthDateInput from '@customer-web/features/passenger-profiles/components/BirthDateInput'
import FormError from '@customer-web/features/passenger-profiles/components/FormError'
import FormField from '@customer-web/features/passenger-profiles/components/FormField'
import NationalitySelect from '@customer-web/features/passenger-profiles/components/NationalitySelect'
import ProfileDialog from '@customer-web/features/passenger-profiles/components/ProfileDialog'
import { birthDateLabel, type Passenger } from '@customer-web/features/passenger-profiles/profile-context'
import { errorMessage, nationalityCode, nationalityLabel } from '../profile-api'
import { parseBirthDateInput } from '../birth-date'

const relationships = ['Spouse', 'Parent', 'Child', 'Sibling', 'Guardian', 'Companion', 'Other']
const genders = ['Female', 'Male', 'Other / unspecified']
// Radix Select items cannot have an empty value, so "no relationship" travels as this sentinel.
const NO_RELATIONSHIP = 'none'

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
    if (!passenger && !draft.gender) {
      setError('Select a gender.')
      return
    }
    if (!passenger && !draft.nationalityCode) {
      setError('Choose a nationality from the list.')
      return
    }
    let dateOfBirth = passenger?.dateOfBirth ?? ''
    if (!passenger) {
      const birthDate = parseBirthDateInput(draft.dateOfBirth, new Date())
      if (birthDate.error) {
        setError(birthDate.error)
        return
      }
      dateOfBirth = birthDate.dateOfBirth
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
      className="sm:max-w-xl"
    >
      <form className="grid gap-4" onSubmit={submit}>
        <FormField label="Relationship to you (optional)">
          {({ id }) => (
            <Select
              value={draft.relationship || NO_RELATIONSHIP}
              onValueChange={(value) => change('relationship', value === NO_RELATIONSHIP ? '' : value)}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_RELATIONSHIP}>Not specified</SelectItem>
                {relationships.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="First name (passport spelling)">
            {({ id }) => (
              <Input
                id={id}
                required
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. SOMCHAI"
                value={draft.firstName}
                onChange={(event) => change('firstName', event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Last name">
            {({ id }) => (
              <Input
                id={id}
                required
                maxLength={80}
                autoComplete="off"
                placeholder="e.g. SARANPAT"
                value={draft.lastName}
                onChange={(event) => change('lastName', event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Local first name (optional)">
            {({ id }) => (
              <Input
                id={id}
                maxLength={80}
                placeholder="e.g. สมชาย"
                value={draft.localFirstName}
                onChange={(event) => change('localFirstName', event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Local last name (optional)">
            {({ id }) => (
              <Input
                id={id}
                maxLength={80}
                placeholder="e.g. สารพัฒน์"
                value={draft.localLastName}
                onChange={(event) => change('localLastName', event.target.value)}
              />
            )}
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Date of birth">
            {({ id }) => (
              <BirthDateInput
                id={id}
                value={draft.dateOfBirth}
                onChange={(dateOfBirth) => change('dateOfBirth', dateOfBirth)}
                onError={setError}
                readOnly={!!passenger}
                describedBy="passenger-lock-note"
              />
            )}
          </FormField>
          <FormField label="Gender">
            {({ id }) => (
              <Select required name="gender" disabled={!!passenger} value={draft.gender} onValueChange={(value) => change('gender', value)}>
                <SelectTrigger id={id} aria-describedby="passenger-lock-note" className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {genders.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          {passenger ? (
            <FormField label="Nationality">
              {({ id }) => (
                <Input
                  id={id}
                  disabled
                  value={draft.nationality || nationalityLabel(draft.nationalityCode)}
                  aria-describedby="passenger-lock-note"
                />
              )}
            </FormField>
          ) : (
            <NationalitySelect
              value={draft.nationalityCode}
              onChange={(code) => change('nationalityCode', code)}
              describedBy="passenger-lock-note"
            />
          )}
        </div>
        <FormField label="Passport number (optional)">
          {({ id }) => (
            <Input
              id={id}
              maxLength={30}
              autoComplete="off"
              placeholder="If known"
              value={draft.passportNumber}
              onChange={(event) => change('passportNumber', event.target.value)}
            />
          )}
        </FormField>
        <p id="passenger-lock-note" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          Date of birth, gender and nationality can’t be changed after saving.
        </p>
        {error && <FormError>{error}</FormError>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save passenger'}
          </Button>
        </DialogFooter>
      </form>
    </ProfileDialog>
  )
}
