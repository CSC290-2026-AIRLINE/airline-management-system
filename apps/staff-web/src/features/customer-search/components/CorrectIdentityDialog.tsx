import { useState } from 'react'
import type { Gender, IdentityCorrection, Person } from '../types'
import { EM_DASH, formatDateOfBirth, genderLabel, nationalityWithCode, parseInputDate, toInputDate } from '../lib/format'
import { COUNTRY_OPTIONS } from '../lib/countries'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Textarea } from '@staff-web/components/ui/textarea'
import { cn } from '@staff-web/lib/utils'

/**
 * "Correct identity" — the only write action in this feature.
 *
 * Desktop renders it as a centred modal over a dimmed backdrop; mobile renders
 * the same fields as a bottom sheet. Both share this form and its validation.
 *
 * The dialog only reports the *edits* it made. The page merges them with the
 * person's current record, because `PUT /api/staff/passengers/:id/identity` restates
 * the whole identity rather than accepting a partial patch.
 */

const GENDER_OPTIONS = [
  { value: 'nochange' as const, label: 'No change' },
  { value: 'F' as const, label: 'F · Female' },
  { value: 'M' as const, label: 'M · Male' },
  { value: 'X' as const, label: 'X · Unspecified' },
]

const NATIONALITY_DROPDOWN = [
  { value: 'nochange' as const, label: 'No change' },
  // Every country, each carrying the lower-case two-letter code the API stores.
  // There is no free-text "Other…": the API only accepts a country code, and every
  // code is listed — see `lib/countries.ts`.
  ...COUNTRY_OPTIONS,
]

const REASON_MIN_LENGTH = 10

/**
 * The Artifact's DOB floor. The backend's `readDateOfBirth` is the rule and rejects
 * anything earlier; this repeats it so a typo is caught on the field instead of costing
 * a round-trip. Keep the two in step — the backend stays authoritative either way.
 */
const EARLIEST_DATE_OF_BIRTH_YEAR = 1900

interface CorrectIdentityDialogProps {
  person: Person
  variant: 'desktop' | 'mobile'
  /** True while the save is in flight; the form is disabled until it settles. */
  saving?: boolean
  /** A failed save, surfaced here so the dialog stays open with the input intact. */
  saveError?: string | null
  onClose: () => void
  onSave: (correction: IdentityCorrection) => void
}

interface FormErrors {
  dateOfBirth?: string
  reason?: string
  confirmed?: string
  change?: string
}

export function CorrectIdentityDialog({ person, variant, saving = false, saveError = null, onClose, onSave }: CorrectIdentityDialogProps) {
  const [dateInput, setDateInput] = useState(() => toInputDate(person.dateOfBirth))
  const [gender, setGender] = useState<'nochange' | Gender>('nochange')
  const [nationality, setNationality] = useState<string>('nochange')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // An empty field means "leave this value as it is", which is also the state a
  // passenger with no date of birth on record starts in.
  const dateIsBlank = dateInput.trim() === ''
  const parsedDate = dateIsBlank ? null : parseInputDate(dateInput)
  const dateChanged = dateIsBlank ? person.dateOfBirth !== null : parsedDate !== person.dateOfBirth
  const genderChanged = gender !== 'nochange' && gender !== person.gender
  const nationalityChanged = nationality !== 'nochange' && nationality !== person.nationality
  const hasChange = dateChanged || genderChanged || nationalityChanged

  function validate(): FormErrors {
    const next: FormErrors = {}
    // Only a field the staff member actually typed into can be malformed.
    if (!dateIsBlank && parsedDate === null) {
      next.dateOfBirth = 'Use the format DD / MM / YYYY, e.g. 21 / 08 / 1992.'
    } else if (parsedDate !== null) {
      // `parseInputDate` only proves the input is a real calendar date. These two bounds
      // are the rest of the Artifact's DOB rule, and the backend enforces them too.
      //
      // `parsedDate` is a zero-padded `yyyy-mm-dd`, so comparing the strings orders the
      // dates exactly as comparing the `Date`s would. "Today" is UTC to match the
      // backend, which compares a UTC-midnight date of birth against `Date.now()`.
      if (parsedDate < `${EARLIEST_DATE_OF_BIRTH_YEAR}-01-01`) {
        next.dateOfBirth = `Date of birth cannot be earlier than ${EARLIEST_DATE_OF_BIRTH_YEAR}.`
      } else if (parsedDate > todayUtc()) {
        next.dateOfBirth = 'Date of birth cannot be in the future.'
      }
    }
    if (reason.trim().length < REASON_MIN_LENGTH) {
      next.reason = `Give a short reason (at least ${REASON_MIN_LENGTH} characters) for the audit log.`
    }
    if (!confirmed) {
      next.confirmed = 'Confirm you checked the values against the passport.'
    }
    if (!hasChange) {
      next.change = 'Change at least one value before saving.'
    }
    return next
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) {
      return
    }

    onSave({
      ...(dateChanged ? { dateOfBirth: dateIsBlank ? null : parsedDate } : {}),
      // `genderChanged` already guarantees `gender !== 'nochange'`; TypeScript
      // narrows through the alias, so re-testing it here is a type error.
      ...(genderChanged ? { gender } : {}),
      ...(nationalityChanged ? { nationality } : {}),
      reason: reason.trim(),
    })
  }

  const isMobile = variant === 'mobile'

  const dateField = (
    <>
      <Input
        type="text"
        inputMode="numeric"
        value={dateInput}
        onChange={(event) => {
          setDateInput(event.target.value)
          if (errors.dateOfBirth) setErrors((prev) => ({ ...prev, dateOfBirth: undefined }))
        }}
        aria-label="Corrected date of birth"
        aria-invalid={Boolean(errors.dateOfBirth)}
      />
      {errors.dateOfBirth ? <FieldError message={errors.dateOfBirth} /> : null}
    </>
  )
  const genderField = (
    <Select value={gender} onValueChange={(value) => setGender(value as Gender | 'nochange')}>
      <SelectTrigger aria-label="Corrected gender" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GENDER_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  const nationalityField = (
    <Select value={nationality} onValueChange={setNationality}>
      <SelectTrigger aria-label="Corrected nationality" className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {NATIONALITY_DROPDOWN.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        className={cn(
          'max-h-[90dvh] overflow-y-auto text-foreground sm:max-w-xl',
          isMobile &&
            'top-auto bottom-0 max-w-full translate-y-0 rounded-b-none sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] sm:rounded-lg',
        )}
        showCloseButton={!saving}
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {isMobile ? 'Correct identity' : `Correct identity · ${person.firstName} ${person.lastName}`}
            </DialogTitle>
            <DialogDescription>
              {isMobile
                ? `${person.firstName} ${person.lastName} · Fix a mistake in date of birth, gender or nationality. Check the passport first.`
                : 'Fix a mistake in date of birth, gender or nationality. Check it against the passport first.'}
            </DialogDescription>
          </DialogHeader>

          {isMobile ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Date of birth</Label>
                  <span className="text-xs text-muted-foreground">Now: {formatDateOfBirth(person.dateOfBirth)}</span>
                </div>
                {dateField}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Gender</Label>
                  <span className="text-xs text-muted-foreground">Now: {currentGender(person)}</span>
                </div>
                {genderField}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>Nationality</Label>
                  <span className="text-xs text-muted-foreground">Now: {nationalityWithCode(person.nationality)}</span>
                </div>
                {nationalityField}
              </div>
            </div>
          ) : (
            <Table>
              <caption className="sr-only">Correctable identity fields</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Field</TableHead>
                  <TableHead scope="col">Current</TableHead>
                  <TableHead scope="col">Corrected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableHead scope="row" className="font-medium text-foreground">
                    Date of birth
                  </TableHead>
                  <TableCell>{formatDateOfBirth(person.dateOfBirth)}</TableCell>
                  <TableCell>{dateField}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row" className="font-medium text-foreground">
                    Gender
                  </TableHead>
                  <TableCell>{currentGender(person)}</TableCell>
                  <TableCell>{genderField}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row" className="font-medium text-foreground">
                    Nationality
                  </TableHead>
                  <TableCell>{nationalityWithCode(person.nationality)}</TableCell>
                  <TableCell>{nationalityField}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-reason">Reason (required)</Label>
            <Textarea
              id="cs-reason"
              placeholder="e.g. Day and month were swapped at booking; passport checked at counter"
              value={reason}
              rows={2}
              onChange={(event) => {
                setReason(event.target.value)
                if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }))
              }}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'cs-reason-error' : undefined}
            />
            {errors.reason ? <FieldError id="cs-reason-error" message={errors.reason} /> : null}
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="cs-confirmed"
              checked={confirmed}
              onCheckedChange={(value) => {
                setConfirmed(value === true)
                if (errors.confirmed) setErrors((prev) => ({ ...prev, confirmed: undefined }))
              }}
              className="mt-0.5"
            />
            <Label htmlFor="cs-confirmed" className="leading-snug font-normal">
              I checked the new values against the passenger’s passport.
            </Label>
          </div>
          {errors.confirmed ? <FieldError message={errors.confirmed} /> : null}
          {errors.change ? <FieldError message={errors.change} /> : null}

          {/* A rejected save is the API's message, not a field error: the dialog stays open with everything typed in. */}
          {saveError ? <FieldError message={saveError} /> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save correction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p className="text-sm text-destructive" id={id} role="alert">
      {message}
    </p>
  )
}

/** `F · Female`, or an em dash when the passenger has no gender on record. */
function currentGender(person: Person): string {
  return person.gender ? `${person.gender} · ${genderLabel(person.gender)}` : EM_DASH
}

/** Today's date as `yyyy-mm-dd` in UTC, for the "not in the future" check. */
function todayUtc(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
}
