import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { DialogFooter } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Textarea } from '@staff-web/components/ui/textarea'
import { listTypes, type EntryFields, type WatchlistEntry } from '../watchlist.types'
import { WatchlistSelect } from './WatchlistSelect'
import { NationalitySelect } from './NationalitySelect'
import { isNationalityCode } from '../nationalities'

function inputDate(value?: string) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day} / ${month} / ${year}`
}

function parseDate(value: string) {
  const match = /^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/.exec(value)
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso && date <= new Date() ? iso : null
}

export function WatchlistEntryForm({
  entry,
  onSave,
  onCancel,
  onClear,
}: {
  entry?: WatchlistEntry
  onSave: (fields: EntryFields) => Promise<void>
  onCancel: () => void
  onClear: () => void
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [listType, setListType] = useState(entry?.listType ?? '')
  const [gender, setGender] = useState<EntryFields['gender']>(entry?.gender ?? '')
  const [nationality, setNationality] = useState(entry?.nationality ?? '')
  const [birthDate, setBirthDate] = useState(inputDate(entry?.dateOfBirth))
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) ?? '').trim()
    if (!value('firstName') || !value('lastName') || !value('issuingAuthority')) {
      setError('Enter a first name, last name and issuing authority. Blank spaces are not accepted.')
      return
    }
    if (listType !== 'wanted' && listType !== 'travel_ban' && listType !== 'no_fly') {
      setError('Select a list type.')
      return
    }
    if (!gender) {
      setError('Select a gender. Choose X · Unspecified if unknown.')
      return
    }
    const dateOfBirth = value('dateOfBirth') ? parseDate(value('dateOfBirth')) : ''
    if (dateOfBirth === null) {
      setError('Enter a valid date of birth as DD / MM / YYYY, no later than today.')
      return
    }
    const passportNumber = value('passportNumber')
    if (nationality && !isNationalityCode(nationality)) {
      setError('Select a nationality from the list.')
      return
    }
    if (passportNumber && !/^[A-Za-z0-9]{1,20}$/.test(passportNumber)) {
      setError('Use up to 20 letters and numbers for the passport.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onSave({
        firstName: value('firstName').toUpperCase(),
        lastName: value('lastName').toUpperCase(),
        dateOfBirth,
        gender,
        nationality,
        passportNumber: passportNumber.toUpperCase(),
        listType,
        issuingAuthority: value('issuingAuthority'),
        reason: value('reason'),
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <fieldset className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0" disabled={submitting}>
        <p className="text-sm text-muted-foreground">Use the spelling on the passport.</p>
        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="wl-first-name">
            <Input id="wl-first-name" name="firstName" defaultValue={entry?.firstName} placeholder="e.g. SOMSAK" required maxLength={100} />
          </Field>
          <Field label="Last name" htmlFor="wl-last-name">
            <Input id="wl-last-name" name="lastName" defaultValue={entry?.lastName} placeholder="e.g. JAIDEE" required maxLength={100} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date of birth" htmlFor="wl-dob">
            <Input
              id="wl-dob"
              name="dateOfBirth"
              value={birthDate}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 8)
                setBirthDate([digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join(' / '))
              }}
              placeholder="DD / MM / YYYY"
              inputMode="numeric"
              autoComplete="bday"
              maxLength={14}
            />
          </Field>
          <Field label="Nationality">
            <NationalitySelect value={nationality} onChange={setNationality} />
          </Field>
          <Field label="Passport number (optional)" htmlFor="wl-passport">
            <Input
              id="wl-passport"
              name="passportNumber"
              defaultValue={entry?.passportNumber ?? ''}
              placeholder="Optional"
              maxLength={20}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="List type">
            <WatchlistSelect
              label="List type"
              value={listType}
              onChange={setListType}
              className="w-full"
              placeholder="Select list type"
              options={Object.entries(listTypes).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Issuing authority" htmlFor="wl-authority">
            <Input
              id="wl-authority"
              name="issuingAuthority"
              defaultValue={entry?.issuingAuthority}
              placeholder="e.g. [Demo authority]"
              required
              maxLength={200}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gender">
            <WatchlistSelect
              label="Gender"
              value={gender}
              onChange={(value) => setGender(value as EntryFields['gender'])}
              className="w-full"
              placeholder="Select gender"
              options={[
                { value: 'M', label: 'M · Male' },
                { value: 'F', label: 'F · Female' },
                { value: 'X', label: 'X · Unspecified' },
              ]}
            />
          </Field>
        </div>
        <Field label="Reason" htmlFor="wl-reason">
          <Textarea
            id="wl-reason"
            name="reason"
            defaultValue={entry?.reason}
            placeholder="e.g. Case reference DEMO-0142"
            maxLength={2000}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Matching uses passport + nationality first (Strong), then name + date of birth (Probable).
        </p>
        {entry?.status === 'cleared' && (
          <p className="text-xs text-muted-foreground">This entry is cleared. Saving changes keeps its cleared status.</p>
        )}
        <DialogFooter className="sm:justify-between">
          {entry?.status === 'active' ? (
            <Button
              type="button"
              variant="outline"
              className="border-destructive text-destructive hover:text-destructive"
              onClick={onClear}
            >
              Clear entry
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">{submitting ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}</Button>
          </div>
        </DialogFooter>
      </fieldset>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
