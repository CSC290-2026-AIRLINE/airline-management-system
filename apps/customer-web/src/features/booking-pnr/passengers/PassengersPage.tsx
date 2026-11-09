import type { DemoPassenger } from './demo-passengers'
import type { FormEvent } from 'react'
import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import { ageAt, passengerType, type BookingContact, type TravellerDraft } from '../flow/draft'

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
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onContinue()
  }
  const departure = itinerary.request.legs[0].date
  return (
    <form onSubmit={submit} className="f3-passengers-form" aria-label="Passenger details">
      {demoProfiles && (
        <div className="f3-demo-notice" role="status">
          <strong>Development demo travellers</strong>
          <p>Choose a seeded demo traveller for each passenger. Options match ages on the first departure. Demo details are read-only.</p>
          {demoLoading && <p>Loading demo travellers…</p>}
          {demoError && <p>{demoError}</p>}
        </div>
      )}
      {travellers.map((person, index) => {
        const type = passengerType(person.dateOfBirth, departure)
        return (
          <fieldset className="f3-passenger-card" key={person.key}>
            <legend>
              Passenger {index + 1} · {type ?? person.expectedType}
              {type === 'child' ? ` (age ${ageAt(person.dateOfBirth, departure)})` : ''}
            </legend>
            {demoProfiles && (
              <label className="f3-demo-picker">
                Fill from demo traveller
                <select
                  required
                  value={person.demoPassengerId ?? ''}
                  disabled={demoLoading}
                  onChange={(event) => {
                    const profile = demoProfiles.find((candidate) => candidate.id === event.target.value)
                    onTravellerChange(person.key, {
                      demoPassengerId: profile?.id,
                      givenName: profile?.givenName ?? '',
                      familyName: profile?.familyName ?? '',
                      dateOfBirth: profile?.dateOfBirth ?? '',
                      passportNumber: profile?.passportNumber ?? '',
                    })
                  }}
                >
                  <option value="">Choose a demo traveller</option>
                  {demoProfiles
                    .filter((profile) => passengerType(profile.dateOfBirth, departure) === person.expectedType)
                    .map((profile) => (
                      <option
                        key={profile.id}
                        value={profile.id}
                        disabled={travellers.some((other) => other.key !== person.key && other.demoPassengerId === profile.id)}
                      >
                        {profile.givenName} {profile.familyName}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="f3-passenger-fields">
              <label>
                Given name (as on passport)
                <input
                  readOnly={!!demoProfiles}
                  autoComplete="given-name"
                  name={`givenName-${index}`}
                  maxLength={100}
                  required
                  value={person.givenName}
                  onChange={(event) => onTravellerChange(person.key, { givenName: event.target.value })}
                />
              </label>
              <label>
                Family name
                <input
                  readOnly={!!demoProfiles}
                  autoComplete="family-name"
                  name={`familyName-${index}`}
                  maxLength={100}
                  required
                  value={person.familyName}
                  onChange={(event) => onTravellerChange(person.key, { familyName: event.target.value })}
                />
              </label>
              <label>
                Date of birth
                <input
                  readOnly={!!demoProfiles}
                  aria-label={`Passenger ${index + 1} date of birth`}
                  type="date"
                  max={departure}
                  required
                  value={person.dateOfBirth}
                  onChange={(event) => onTravellerChange(person.key, { dateOfBirth: event.target.value })}
                />
              </label>
              <label>
                Passport number
                <input
                  readOnly={!!demoProfiles}
                  autoComplete="off"
                  name={`passport-${index}`}
                  maxLength={30}
                  required
                  value={person.passportNumber}
                  onChange={(event) => onTravellerChange(person.key, { passportNumber: event.target.value })}
                />
              </label>
            </div>
            {(type ?? person.expectedType) === 'infant' && (
              <label className="f3-lap-field">
                Travels on the lap of
                <select
                  value={person.lapOfKey}
                  required
                  onChange={(event) => onTravellerChange(person.key, { lapOfKey: event.target.value })}
                >
                  <option value="">Choose an adult</option>
                  {travellers
                    .filter((adult) => adult.expectedType === 'adult')
                    .map((adult, adultIndex) => (
                      <option key={adult.key} value={adult.key}>
                        {[adult.givenName, adult.familyName].filter(Boolean).join(' ') || `Adult ${adultIndex + 1}`}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </fieldset>
        )
      })}
      <fieldset className="f3-passenger-card">
        <legend>Contact for this booking</legend>
        <div className="f3-passenger-fields">
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={contact.email}
              onChange={(event) => onContactChange({ ...contact, email: event.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              autoComplete="tel"
              required
              maxLength={50}
              value={contact.phone}
              onChange={(event) => onContactChange({ ...contact, phone: event.target.value })}
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="f3-passenger-card">
        <legend>Promo code</legend>
        <label>
          Code (optional)
          <input
            autoComplete="off"
            maxLength={100}
            value={contact.promoCode}
            onChange={(event) => onContactChange({ ...contact, promoCode: event.target.value })}
          />
        </label>
        <p>The code is checked when you create the booking hold. If the total changes, you can review it before continuing.</p>
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
