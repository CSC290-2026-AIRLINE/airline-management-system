import { GENDER_OPTIONS, fillFromSaved, type SavedTraveller } from './saved-travellers'
import { Input } from '@customer-web/components/ui/input'
import type { FormEvent, ReactNode } from 'react'
import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { DatePicker } from '@customer-web/components/ui/date-picker'
import { Field } from '@customer-web/components/ui/field'
import {
  ageAt,
  contactFieldId,
  passengerType,
  travellerFieldId,
  type BookingContact,
  type TravellerDraft,
  type TravellerIssues,
} from '../flow/draft'

/** The earliest date of birth the calendar offers. The year list runs from here to the year of the first departure. */
const EARLIEST_BIRTH = '1900-01-01'

interface Props {
  itinerary: SearchItinerary
  travellers: TravellerDraft[]
  contact: BookingContact
  onTravellerChange: (key: string, change: Partial<TravellerDraft>) => void
  onContactChange: (contact: BookingContact) => void
  onBack: () => void
  onContinue: () => void
  /** The customer and their saved travellers (Feature 7), offered to fill each passenger. */
  savedTravellers?: SavedTraveller[]
  savedLoading?: boolean
  savedError?: string | null
  /** Whether the passenger details are read-only, so every passenger must be a saved traveller (the staff console). */
  lockDetails?: boolean
  renderAssistance?: (traveller: TravellerDraft) => ReactNode
  /** What is wrong with the details, with a message for every field that is wrong. */
  issues?: TravellerIssues | null
  error: string | null
}
export function PassengersPage({
  itinerary,
  travellers,
  contact,
  onTravellerChange,
  onContactChange,
  onBack,
  onContinue,
  error,
  savedTravellers,
  savedLoading,
  savedError,
  lockDetails,
  renderAssistance,
  issues,
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onContinue()
  }
  const departure = itinerary.request.legs[0].date
  const locked = lockDetails ?? false
  /** The message under a field, when that field is the one that is wrong. */
  const problemFor = (id: string) => issues?.fields[id]
  return (
    /* `noValidate` turns off the browser's own bubbles, so every message on this form is one we wrote. */
    <form onSubmit={submit} className="grid min-w-0 gap-4" aria-label="Passenger details" noValidate>
      {issues && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {issues.message}
        </p>
      )}
      {savedTravellers && (
        <div className="rounded-lg border border-link/20 bg-link/5 px-4 py-3 text-sm text-link [&_p]:mt-1" role="status">
          <strong>Saved travellers</strong>
          <p>
            {locked
              ? "Choose one of the customer's saved travellers for each passenger. The options match ages on the first departure. Details are read-only."
              : 'Pick a saved traveller to fill the details, or type new ones. New travellers are saved to your account when you hold the booking.'}
          </p>
          {savedLoading && <p>Loading saved travellers…</p>}
          {savedError && <p>{savedError}</p>}
          {!savedLoading && !savedError && savedTravellers.length === 0 && (
            <p>{locked ? 'This customer has no saved travellers yet.' : 'You have no saved travellers yet.'}</p>
          )}
        </div>
      )}
      {travellers.map((person, index) => {
        const type = passengerType(person.dateOfBirth, departure)
        const givenId = travellerFieldId(index, 'givenName')
        const familyId = travellerFieldId(index, 'familyName')
        const birthId = travellerFieldId(index, 'dateOfBirth')
        const passportId = travellerFieldId(index, 'passportNumber')
        const genderId = travellerFieldId(index, 'gender')
        const nationalityId = travellerFieldId(index, 'nationality')
        const lapId = travellerFieldId(index, 'lapOfKey')
        const savedId = `pax-${index}-saved`
        return (
          <fieldset
            className="rounded-xl border bg-card text-card-foreground shadow-sm grid min-w-0 gap-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground"
            key={person.key}
          >
            <legend className="sr-only">
              Passenger {index + 1} · {type ?? person.expectedType}
              {type === 'child' ? ` (age ${ageAt(person.dateOfBirth, departure)})` : ''}
            </legend>
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row [&>div]:min-w-0 [&_h2]:mt-1.5 [&_h2]:text-lg [&_h2]:[overflow-wrap:anywhere]">
              <div>
                <p className="w-fit rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  PASSENGER {index + 1} · {type ?? person.expectedType}
                  {type === 'child' ? ` (AGE ${ageAt(person.dateOfBirth, departure)})` : ''}
                </p>
                <h2>{[person.givenName, person.familyName].filter(Boolean).join(' ') || 'Traveller details'}</h2>
              </div>
              {savedTravellers && (
                <Field id={savedId} label="Fill from saved traveller" className="w-full sm:w-56 sm:shrink-0">
                  <Select
                    value={person.savedPassengerId ?? ''}
                    disabled={savedLoading}
                    onValueChange={(value) =>
                      onTravellerChange(person.key, fillFromSaved(savedTravellers.find((candidate) => candidate.id === value)))
                    }
                  >
                    <SelectTrigger id={savedId} aria-labelledby={`${savedId}-label`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{locked ? 'Choose a saved traveller' : 'New traveller'}</SelectItem>
                      {savedTravellers
                        .filter((profile) => passengerType(profile.dateOfBirth, departure) === person.expectedType)
                        .map((profile) => (
                          <SelectItem
                            key={profile.id}
                            value={profile.id}
                            disabled={travellers.some((other) => other.key !== person.key && other.savedPassengerId === profile.id)}
                          >
                            {profile.givenName} {profile.familyName} · {profile.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={givenId} label="Given name (as on passport)" error={problemFor(givenId)}>
                <Input
                  id={givenId}
                  readOnly={locked}
                  autoComplete="given-name"
                  name={`givenName-${index}`}
                  maxLength={100}
                  required
                  aria-invalid={problemFor(givenId) ? true : undefined}
                  aria-describedby={problemFor(givenId) ? `${givenId}-error` : undefined}
                  value={person.givenName}
                  onChange={(event) => onTravellerChange(person.key, { givenName: event.target.value })}
                />
              </Field>
              <Field id={familyId} label="Family name" error={problemFor(familyId)}>
                <Input
                  id={familyId}
                  readOnly={locked}
                  autoComplete="family-name"
                  name={`familyName-${index}`}
                  maxLength={100}
                  required
                  aria-invalid={problemFor(familyId) ? true : undefined}
                  aria-describedby={problemFor(familyId) ? `${familyId}-error` : undefined}
                  value={person.familyName}
                  onChange={(event) => onTravellerChange(person.key, { familyName: event.target.value })}
                />
              </Field>
              <Field id={birthId} label="Date of birth" error={problemFor(birthId)}>
                <DatePicker
                  id={birthId}
                  value={person.dateOfBirth}
                  min={EARLIEST_BIRTH}
                  max={departure}
                  required
                  readOnly={locked}
                  invalid={!!problemFor(birthId)}
                  ariaLabelledBy={`${birthId}-label`}
                  describedBy={problemFor(birthId) ? `${birthId}-error` : undefined}
                  onChange={(date) => onTravellerChange(person.key, { dateOfBirth: date })}
                />
              </Field>
              <Field id={passportId} label="Passport number" error={problemFor(passportId)}>
                <Input
                  id={passportId}
                  readOnly={locked}
                  autoComplete="off"
                  name={`passport-${index}`}
                  maxLength={30}
                  required
                  aria-invalid={problemFor(passportId) ? true : undefined}
                  aria-describedby={problemFor(passportId) ? `${passportId}-error` : undefined}
                  value={person.passportNumber}
                  onChange={(event) => onTravellerChange(person.key, { passportNumber: event.target.value })}
                />
              </Field>
              <Field id={genderId} label="Gender (as on passport)" error={problemFor(genderId)}>
                <Select value={person.gender} disabled={locked} onValueChange={(value) => onTravellerChange(person.key, { gender: value })}>
                  <SelectTrigger
                    id={genderId}
                    aria-labelledby={`${genderId}-label`}
                    aria-invalid={problemFor(genderId) ? true : undefined}
                    aria-describedby={problemFor(genderId) ? `${genderId}-error` : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Choose</SelectItem>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id={nationalityId} label="Nationality (country code, like TH)" error={problemFor(nationalityId)}>
                <Input
                  id={nationalityId}
                  readOnly={locked}
                  autoComplete="off"
                  name={`nationality-${index}`}
                  maxLength={2}
                  aria-invalid={problemFor(nationalityId) ? true : undefined}
                  aria-describedby={problemFor(nationalityId) ? `${nationalityId}-error` : undefined}
                  value={person.nationality}
                  onChange={(event) => onTravellerChange(person.key, { nationality: event.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            {(type ?? person.expectedType) === 'infant' && (
              <Field id={lapId} label="Travels on the lap of" error={problemFor(lapId)} className="">
                <Select value={person.lapOfKey} onValueChange={(value) => onTravellerChange(person.key, { lapOfKey: value })}>
                  <SelectTrigger
                    id={lapId}
                    aria-labelledby={`${lapId}-label`}
                    aria-invalid={problemFor(lapId) ? true : undefined}
                    aria-describedby={problemFor(lapId) ? `${lapId}-error` : undefined}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Choose an adult</SelectItem>
                    {travellers
                      .filter((adult) => adult.expectedType === 'adult')
                      .map((adult, adultIndex) => (
                        <SelectItem key={adult.key} value={adult.key}>
                          {[adult.givenName, adult.familyName].filter(Boolean).join(' ') || `Adult ${adultIndex + 1}`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {renderAssistance?.(person)}
          </fieldset>
        )
      })}
      <fieldset className="rounded-xl border bg-card text-card-foreground shadow-sm grid min-w-0 gap-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground">
        <legend className="sr-only">Contact for this booking</legend>
        <h2 className="text-base font-semibold">Contact for this booking</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={contactFieldId('email')} label="Email" error={problemFor(contactFieldId('email'))}>
            <Input
              id={contactFieldId('email')}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={problemFor(contactFieldId('email')) ? true : undefined}
              aria-describedby={problemFor(contactFieldId('email')) ? `${contactFieldId('email')}-error` : undefined}
              value={contact.email}
              onChange={(event) => onContactChange({ ...contact, email: event.target.value })}
            />
          </Field>
          <Field id={contactFieldId('phone')} label="Phone (optional)" error={problemFor(contactFieldId('phone'))}>
            <Input
              id={contactFieldId('phone')}
              type="tel"
              autoComplete="tel"
              maxLength={50}
              aria-invalid={problemFor(contactFieldId('phone')) ? true : undefined}
              aria-describedby={problemFor(contactFieldId('phone')) ? `${contactFieldId('phone')}-error` : undefined}
              value={contact.phone}
              onChange={(event) => onContactChange({ ...contact, phone: event.target.value })}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="rounded-xl border bg-card text-card-foreground shadow-sm grid min-w-0 gap-4 p-5 sm:p-6 [&>p]:text-sm [&>p]:text-muted-foreground">
        <legend className="sr-only">Promo code</legend>
        <h2 className="text-base font-semibold">Promo code</h2>
        <Field id={contactFieldId('promoCode')} label="Code (optional)">
          <Input
            id={contactFieldId('promoCode')}
            autoComplete="off"
            maxLength={100}
            value={contact.promoCode}
            onChange={(event) => onContactChange({ ...contact, promoCode: event.target.value })}
          />
        </Field>
        <p className="rounded-md border border-link/20 bg-link/5 px-3 py-2 text-xs text-link">
          The code is checked when you create the booking hold. If the total changes, you can review it before continuing. It is used up
          only when payment succeeds.
        </p>
      </fieldset>
      {error && (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-4 text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          onClick={onBack}
        >
          Back to flights
        </button>
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-xs transition-all outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          Continue to seats
        </button>
      </div>
    </form>
  )
}
