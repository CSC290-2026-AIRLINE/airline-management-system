import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import type { PassengerType } from '../api/types'

export interface TravellerDraft {
  key: string
  expectedType: PassengerType
  givenName: string
  familyName: string
  dateOfBirth: string
  passportNumber: string
  lapOfKey: string
}
export interface BookingContact {
  email: string
  phone: string
  promoCode: string
}

// Supplied by the agreed Feature 7 adapter. Feature 3 must not create profile records itself.
export type ResolvePassengers = (travellers: TravellerDraft[]) => Promise<Array<{ key: string; passengerId: string }>>

const STORAGE_KEY = 'f03-search-itinerary'
export function saveItinerary(itinerary: SearchItinerary) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(itinerary))
}
export function readItinerary(): SearchItinerary | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as SearchItinerary | null
    if (
      !value ||
      !Array.isArray(value.request?.legs) ||
      value.request.legs.length < 1 ||
      value.request.legs.length > 5 ||
      !Array.isArray(value.selections) ||
      value.selections.length !== value.request.legs.length ||
      !Number.isFinite(value.expectedTotal) ||
      value.expectedTotal < 0
    )
      return null
    if (
      value.selections.some(
        (selection) =>
          !selection?.flight?.flightId ||
          !selection.fare?.fareClassId ||
          !Array.isArray(selection.flight.cabins) ||
          !Number.isFinite(selection.fare.pricePerPassenger),
      )
    )
      return null
    const party = value.request
    if (
      ![party.adults, party.children, party.infants].every((count) => Number.isInteger(count) && count >= 0) ||
      party.adults + party.children < 1 ||
      party.adults + party.children > 9 ||
      party.infants > party.adults
    )
      return null
    return value
  } catch {
    return null
  }
}
export function travellersFor(itinerary: SearchItinerary, current: TravellerDraft[] = []): TravellerDraft[] {
  const types: PassengerType[] = [
    ...Array<PassengerType>(itinerary.request.adults).fill('adult'),
    ...Array<PassengerType>(itinerary.request.children).fill('child'),
    ...Array<PassengerType>(itinerary.request.infants).fill('infant'),
  ]
  return types.map((expectedType, index) =>
    current[index]?.expectedType === expectedType
      ? current[index]
      : {
          key: crypto.randomUUID(),
          expectedType,
          givenName: '',
          familyName: '',
          dateOfBirth: '',
          passportNumber: '',
          lapOfKey: '',
        },
  )
}
export function ageAt(birth: string, departure: string): number {
  const born = new Date(`${birth}T00:00:00Z`),
    date = new Date(`${departure}T00:00:00Z`)
  let age = date.getUTCFullYear() - born.getUTCFullYear()
  if (date.getUTCMonth() < born.getUTCMonth() || (date.getUTCMonth() === born.getUTCMonth() && date.getUTCDate() < born.getUTCDate())) age--
  return age
}
export function passengerType(birth: string, departure: string): PassengerType | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !Number.isFinite(Date.parse(birth)) || new Date(birth).toISOString().slice(0, 10) !== birth)
    return null
  const age = ageAt(birth, departure)
  return age < 0 ? null : age < 2 ? 'infant' : age < 12 ? 'child' : 'adult'
}
export function validateTravellers(travellers: TravellerDraft[], contact: BookingContact, itinerary: SearchItinerary): string | null {
  const first = itinerary.request.legs[0].date,
    last = itinerary.request.legs.at(-1)!.date
  const usedLaps = new Set<string>()
  for (const [index, person] of travellers.entries()) {
    if (!person.givenName.trim() || !person.familyName.trim() || !person.passportNumber.trim())
      return `Complete the name and passport details for passenger ${index + 1}.`
    const type = passengerType(person.dateOfBirth, first)
    if (type !== person.expectedType)
      return `Passenger ${index + 1}'s date of birth does not match the ${person.expectedType} selected in search. Update the date or return to flights to change your party.`
    if (type === 'infant') {
      if (ageAt(person.dateOfBirth, last) >= 2) return 'A lap infant must remain under two until the last flight.'
      if (!travellers.some((adult) => adult.key === person.lapOfKey && adult.expectedType === 'adult') || usedLaps.has(person.lapOfKey))
        return 'Choose a different accompanying adult for each infant.'
      usedLaps.add(person.lapOfKey)
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) || !contact.phone.trim())
    return 'Enter a valid contact email and phone number.'
  return null
}
