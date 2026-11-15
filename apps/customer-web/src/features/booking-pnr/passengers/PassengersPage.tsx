import type { DemoPassenger } from './demo-passengers'
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
  demoProfiles?: DemoPassenger[]
  demoLoading?: boolean
  demoError?: string | null
  /** Whether the passenger details are read-only. Defaults to read-only when demo travellers are offered. */
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
  demoProfiles,
  demoLoading,
  demoError,
  lockDetails,
  renderAssistance,
  issues,
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onContinue()
  }
  const departure = itinerary.request.legs[0].date
  const locked = lockDetails ?? !!demoProfiles
  /** The message under a field, when that field is the one that is wrong. */
  const problemFor = (id: string) => issues?.fields[id]
  return (
    /* `noValidate` turns off the browser's own bubbles, so every message on this form is one we wrote. */
    <form onSubmit={submit} className="f3-passengers-form" aria-label="Passenger details" noValidate>
      {issues && (
        <p className="f3-flow-error" role="alert">
          {issues.message}
        </p>
      )}
      {demoProfiles && (
        <div className="f3-demo-notice" role="status">
          <strong>Development demo travellers</strong>
          <p>
            {locked
              ? 'Choose a seeded demo traveller for each passenger. Options match ages on the first departure. Demo details are read-only.'
              : 'Pick a seeded demo traveller to fill the details, or type them yourself. The options match the ages on the first departure.'}
          </p>
          {demoLoading && <p>Loading demo travellers…</p>}
          {demoError && <p>{demoError}</p>}
        </div>
      )}
      {travellers.map((person, index) => {
        const type = passengerType(person.dateOfBirth, departure)
        const givenId = travellerFieldId(index, 'givenName')
        const familyId = travellerFieldId(index, 'familyName')
        const birthId = travellerFieldId(index, 'dateOfBirth')
        const passportId = travellerFieldId(index, 'passportNumber')
        const lapId = travellerFieldId(index, 'lapOfKey')
        const demoId = `pax-${index}-demo`
        return (
          <fieldset className="f3-passenger-card" key={person.key}>
            <legend className="f3-passenger-legend">
              Passenger {index + 1} · {type ?? person.expectedType}
              {type === 'child' ? ` (age ${ageAt(person.dateOfBirth, departure)})` : ''}
            </legend>
            <div className="f3-passenger-heading">
              <div>
                <p className="f3-search-eyebrow">
                  PASSENGER {index + 1} · {type ?? person.expectedType}
                  {type === 'child' ? ` (AGE ${ageAt(person.dateOfBirth, departure)})` : ''}
                </p>
                <h2>{[person.givenName, person.familyName].filter(Boolean).join(' ') || 'Traveller details'}</h2>
              </div>
              {demoProfiles && (
                <Field id={demoId} label="Fill from demo traveller" className="f3-demo-picker">
                  <Select
                    value={person.demoPassengerId ?? ''}
                    disabled={demoLoading}
                    onValueChange={(value) => {
                      const profile = demoProfiles.find((candidate) => candidate.id === value)
                      onTravellerChange(person.key, {
                        demoPassengerId: profile?.id,
                        givenName: profile?.givenName ?? '',
                        familyName: profile?.familyName ?? '',
                        dateOfBirth: profile?.dateOfBirth ?? '',
                        passportNumber: profile?.passportNumber ?? '',
                      })
                    }}
                  >
                    <SelectTrigger id={demoId} aria-labelledby={`${demoId}-label`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Choose a demo traveller</SelectItem>
                      {demoProfiles
                        .filter((profile) => passengerType(profile.dateOfBirth, departure) === person.expectedType)
                        .map((profile) => (
                          <SelectItem
                            key={profile.id}
                            value={profile.id}
                            disabled={travellers.some((other) => other.key !== person.key && other.demoPassengerId === profile.id)}
                          >
                            {profile.givenName} {profile.familyName}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </div>
            <div className="f3-passenger-fields">
              <Field id={givenId} label="Given name (as on passport)" error={problemFor(givenId)}>
                <input
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
                <input
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
                <input
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
            </div>
            {(type ?? person.expectedType) === 'infant' && (
              <Field id={lapId} label="Travels on the lap of" error={problemFor(lapId)} className="f3-lap-field">
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
      <fieldset className="f3-passenger-card">
        <legend className="f3-passenger-legend">Contact for this booking</legend>
        <h2 className="f3-passenger-section-title">Contact for this booking</h2>
        <div className="f3-passenger-fields">
          <Field id={contactFieldId('email')} label="Email" error={problemFor(contactFieldId('email'))}>
            <input
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
          <Field id={contactFieldId('phone')} label="Phone" error={problemFor(contactFieldId('phone'))}>
            <input
              id={contactFieldId('phone')}
              type="tel"
              autoComplete="tel"
              required
              maxLength={50}
              aria-invalid={problemFor(contactFieldId('phone')) ? true : undefined}
              aria-describedby={problemFor(contactFieldId('phone')) ? `${contactFieldId('phone')}-error` : undefined}
              value={contact.phone}
              onChange={(event) => onContactChange({ ...contact, phone: event.target.value })}
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="f3-passenger-card">
        <legend className="f3-passenger-legend">Promo code</legend>
        <h2 className="f3-passenger-section-title">Promo code</h2>
        <Field id={contactFieldId('promoCode')} label="Code (optional)">
          <input
            id={contactFieldId('promoCode')}
            autoComplete="off"
            maxLength={100}
            value={contact.promoCode}
            onChange={(event) => onContactChange({ ...contact, promoCode: event.target.value })}
          />
        </Field>
        <p className="f3-passenger-info">
          The code is checked when you create the booking hold. If the total changes, you can review it before continuing. It is used up
          only when payment succeeds.
        </p>
      </fieldset>
      {error && (
        <p className="f3-flow-error" role="alert">
          {error}
        </p>
      )}
      <div className="f3-flow-actions">
        <button type="button" className="f3-search-secondary" onClick={onBack}>
          Back to flights
        </button>
        <button type="submit" className="f3-search-primary">
          Continue to seats
        </button>
      </div>
    </form>
  )
}
