import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import {
  flightSearchParamsFromState,
  flightSearchStateFromParams,
  parseFlightSearchParams,
  type FlightSearchUrlState,
} from '../../booking-search/search-params'
import type { PassengerType, HoldBookingResponse, ServiceCode } from '../api/types'
import type { AssistanceValue } from '../components/contracts'
import type { SeatChoice } from './integration'
export interface TravellerDraft {
  key: string
  demoPassengerId?: string
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
  return partyTypes(itinerary).map((expectedType, index) =>
    current[index]?.expectedType === expectedType ? current[index] : blankTraveller(expectedType),
  )
}
/** The passenger types of the party, in the order the travellers are shown. */
export function partyTypes(itinerary: SearchItinerary): PassengerType[] {
  return [
    ...Array<PassengerType>(itinerary.request.adults).fill('adult'),
    ...Array<PassengerType>(itinerary.request.children).fill('child'),
    ...Array<PassengerType>(itinerary.request.infants).fill('infant'),
  ]
}
function blankTraveller(expectedType: PassengerType): TravellerDraft {
  return {
    key: crypto.randomUUID(),
    expectedType,
    givenName: '',
    familyName: '',
    dateOfBirth: '',
    passportNumber: '',
    lapOfKey: '',
  }
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

/* The booking flow draft: what the customer has typed so far, kept so a refresh does not wipe it.
   It lives in sessionStorage like the itinerary, because passenger details must not sit in the address bar. */
const FLOW_STORAGE_KEY = 'f03-booking-flow'
const FLOW_DRAFT_VERSION = 1
const SERVICE_CODES: ServiceCode[] = ['WCHR', 'WCHS', 'WCHC', 'UMNR', 'MEDA']
const SEAT_CODE = /^[1-9][0-9]?[A-Z]$/

/** What the flow page restores when it opens. */
export interface RestoredFlow {
  step: 1 | 2 | 3 | 4
  travellers: TravellerDraft[]
  contact: BookingContact
  assistance: Record<string, AssistanceValue>
  choices: SeatChoice[]
  held: HoldBookingResponse | null
  /** The search the customer had open on the flights step. */
  search: FlightSearchUrlState | null
}
/** What the flow page hands over to be kept. */
export interface FlowSnapshot {
  step: 1 | 2 | 3 | 4
  travellers: TravellerDraft[]
  contact: BookingContact
  assistance: Record<string, AssistanceValue>
  choices: SeatChoice[]
  held: HoldBookingResponse | null
  search: FlightSearchUrlState | null
}

/** Ties a draft to the flights it was made for. The price may change, the flights may not. */
export function itineraryKey(itinerary: SearchItinerary): string {
  return JSON.stringify({
    tripType: itinerary.request.tripType,
    legs: itinerary.request.legs.map((leg) => [leg.origin, leg.destination, leg.date]),
    flights: itinerary.selections.map((selection) => [selection.flight.flightId, selection.fare.fareClassId, selection.fare.cabin]),
  })
}
function readText(value: unknown, max = 254): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}
/** A stored traveller, or null when it cannot be used. */
function sanitiseTraveller(value: unknown): TravellerDraft | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const expectedType = raw.expectedType
  if (expectedType !== 'adult' && expectedType !== 'child' && expectedType !== 'infant') return null
  const key = typeof raw.key === 'string' ? raw.key : ''
  if (!key) return null
  return {
    key,
    expectedType,
    ...(typeof raw.demoPassengerId === 'string' ? { demoPassengerId: raw.demoPassengerId } : {}),
    givenName: readText(raw.givenName, 100),
    familyName: readText(raw.familyName, 100),
    dateOfBirth: readText(raw.dateOfBirth, 10),
    passportNumber: readText(raw.passportNumber, 30),
    lapOfKey: typeof raw.lapOfKey === 'string' ? raw.lapOfKey : '',
  }
}
/** The stored travellers, lined up with the party of the itinerary. */
function alignTravellers(itinerary: SearchItinerary, stored: unknown): TravellerDraft[] {
  const list = Array.isArray(stored) ? stored : []
  const travellers = partyTypes(itinerary).map((expectedType, index) => {
    const candidate = sanitiseTraveller(list[index])
    return candidate?.expectedType === expectedType ? candidate : blankTraveller(expectedType)
  })
  const adults = new Set(travellers.filter((person) => person.expectedType === 'adult').map((person) => person.key))
  return travellers.map((person) =>
    person.expectedType === 'infant' && person.lapOfKey && !adults.has(person.lapOfKey) ? { ...person, lapOfKey: '' } : person,
  )
}
function sanitiseAssistance(value: unknown, travellers: TravellerDraft[]): Record<string, AssistanceValue> {
  if (!value || typeof value !== 'object') return {}
  const keys = new Set(travellers.map((person) => person.key))
  const result: Record<string, AssistanceValue> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!keys.has(key) || !entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const code = raw.serviceCode
    if (code !== null && code !== undefined && !(typeof code === 'string' && SERVICE_CODES.includes(code as ServiceCode))) continue
    result[key] = { serviceCode: (code as ServiceCode | null | undefined) ?? null, note: readText(raw.note, 500) }
  }
  return result
}
function sanitiseChoices(value: unknown, travellers: TravellerDraft[], itinerary: SearchItinerary): SeatChoice[] {
  if (!Array.isArray(value)) return []
  const people = new Map(travellers.filter((person) => person.expectedType !== 'infant').map((person) => [person.key, person]))
  const flights = new Set(itinerary.selections.map((selection) => selection.flight.flightId))
  const passengers = new Set<string>()
  const seats = new Set<string>()
  const choices: SeatChoice[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const travellerKey = typeof raw.travellerKey === 'string' ? raw.travellerKey : ''
    const flightId = typeof raw.flightId === 'string' ? raw.flightId : ''
    const seatCode = typeof raw.seatCode === 'string' ? raw.seatCode : ''
    if (!people.has(travellerKey) || !flights.has(flightId) || !SEAT_CODE.test(seatCode)) continue
    const passenger = `${flightId}/${travellerKey}`
    const seat = `${flightId}/${seatCode}`
    if (passengers.has(passenger) || seats.has(seat)) continue
    passengers.add(passenger)
    seats.add(seat)
    choices.push({ travellerKey, flightId, seatCode })
  }
  return choices
}
/**
 * The search the customer had open on the flights step. It goes through the same parser as the URL, so a stale or
 * hand-edited draft falls back to the defaults instead of breaking the page.
 */
function sanitiseSearch(value: unknown): FlightSearchUrlState | null {
  if (!value || typeof value !== 'object') return null
  const params = parseFlightSearchParams(value as Record<string, unknown>)
  if (Object.keys(params).length === 0) return null
  return flightSearchStateFromParams(params)
}
function sanitiseHeld(value: unknown): HoldBookingResponse | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.reference !== 'string' || !raw.reference) return null
  if (typeof raw.total !== 'number' || !Number.isFinite(raw.total) || raw.total < 0) return null
  const holdExpiresAt = readText(raw.holdExpiresAt, 40)
  const currency = readText(raw.currency, 8)
  if (!holdExpiresAt || !Number.isFinite(Date.parse(holdExpiresAt))) return null
  return {
    bookingId: readText(raw.bookingId, 64),
    reference: raw.reference,
    total: raw.total,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    holdExpiresAt,
  }
}

/**
 * The flow as it was left. A draft that belongs to other flights keeps the traveller details, but starts the
 * passenger step again without the seats and the assistance of the old flight.
 */
export function readFlowDraft(itinerary: SearchItinerary | null): RestoredFlow | null {
  if (!itinerary) return null
  let raw: unknown
  try {
    raw = JSON.parse(sessionStorage.getItem(FLOW_STORAGE_KEY) ?? 'null')
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const draft = raw as Record<string, unknown>
  if (draft.version !== FLOW_DRAFT_VERSION) return null
  const travellers = alignTravellers(itinerary, draft.travellers)
  const sameItinerary = draft.itineraryKey === itineraryKey(itinerary)
  const held = sameItinerary ? sanitiseHeld(draft.held) : null
  const stored = draft.step
  const step = stored === 1 || stored === 2 || stored === 3 || stored === 4 ? stored : 2
  return {
    // A held booking belongs to the flights it was made for. Other flights mean other seats and other assistance,
    // so the passenger step starts again.
    step: held ? 4 : step === 4 ? 2 : sameItinerary ? step : 2,
    travellers,
    contact: {
      email: readText((draft.contact as Record<string, unknown> | undefined)?.email),
      phone: readText((draft.contact as Record<string, unknown> | undefined)?.phone, 50),
      promoCode: readText((draft.contact as Record<string, unknown> | undefined)?.promoCode, 100),
    },
    assistance: sameItinerary ? sanitiseAssistance(draft.assistance, travellers) : {},
    choices: sameItinerary ? sanitiseChoices(draft.choices, travellers, itinerary) : [],
    held,
    search: sameItinerary ? sanitiseSearch(draft.search) : null,
  }
}

/** Keeps the flow. Once the booking is held the passenger details are dropped, they are not needed any more. */
export function saveFlowDraft(itinerary: SearchItinerary, snapshot: FlowSnapshot) {
  const held = snapshot.step === 4 ? snapshot.held : null
  const draft = {
    version: FLOW_DRAFT_VERSION,
    itineraryKey: itineraryKey(itinerary),
    step: snapshot.step,
    travellers: held ? [] : snapshot.travellers,
    contact: held ? { email: '', phone: '', promoCode: '' } : snapshot.contact,
    assistance: held ? {} : snapshot.assistance,
    choices: held ? [] : snapshot.choices,
    held,
    search: held || !snapshot.search ? null : flightSearchParamsFromState(snapshot.search),
  }
  try {
    sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // A full or blocked storage must not break the booking.
  }
}
export function clearFlowDraft() {
  try {
    sessionStorage.removeItem(FLOW_STORAGE_KEY)
  } catch {
    // A blocked storage must not break the booking.
  }
}
