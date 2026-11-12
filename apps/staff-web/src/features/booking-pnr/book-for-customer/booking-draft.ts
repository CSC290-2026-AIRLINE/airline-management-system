import {
  flightSearchParamsFromState,
  flightSearchStateFromParams,
  parseFlightSearchParams,
  type FlightSearchUrlState,
} from '../../../../../customer-web/src/features/booking-search/search-params'
import type { SearchItinerary } from '../../../../../customer-web/src/features/booking-search/pages/FlightSearchPage'
import { travellersFor, type BookingContact, type TravellerDraft } from '../../../../../customer-web/src/features/booking-pnr/flow/draft'
import type { HoldBookingResponse, PassengerType } from '../api/types'

export type StaffBookingStep = 'search' | 'passengers' | 'seats' | 'held'

/** The idempotency key of the last hold request, so a retry after a refresh is not a second booking. */
export interface StaffBookingAttempt {
  body: string
  key: string
}

export interface StaffBookingDraft {
  version: 1
  customerId: string
  step: StaffBookingStep
  search: FlightSearchUrlState | null
  itinerary: SearchItinerary | null
  travellers: TravellerDraft[]
  contact: BookingContact
  held: HoldBookingResponse | null
  attempt: StaffBookingAttempt | null
}

const STORAGE_KEY = 'f03-staff-booking-draft'
const VERSION = 1
const STEPS: StaffBookingStep[] = ['search', 'passengers', 'seats', 'held']
const PASSENGER_TYPES: PassengerType[] = ['adult', 'child', 'infant']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}

function isItinerary(value: unknown): value is SearchItinerary {
  if (!isRecord(value)) return false
  const request = value.request
  if (!isRecord(request) || !Array.isArray(request.legs)) return false
  if (request.legs.length < 1 || request.legs.length > 5) return false
  if (!request.legs.every((leg) => isRecord(leg) && isText(leg.origin) && isText(leg.destination) && isText(leg.date))) return false
  if (!Array.isArray(value.selections) || value.selections.length !== request.legs.length) return false
  if (!Number.isFinite(value.expectedTotal) || (value.expectedTotal as number) < 0) return false
  const counts = [request.adults, request.children, request.infants]
  if (!counts.every((count) => Number.isInteger(count) && (count as number) >= 0)) return false
  const adults = request.adults as number
  const children = request.children as number
  const infants = request.infants as number
  if (adults + children < 1 || adults + children > 9 || infants > adults) return false
  return value.selections.every((selection) => {
    if (!isRecord(selection) || !isRecord(selection.flight) || !isRecord(selection.fare)) return false
    const flight = selection.flight
    const fare = selection.fare
    if (!isText(flight.flightId) || !flight.flightId) return false
    if (!Array.isArray(flight.cabins)) return false
    if (!isText(fare.fareClassId) || !fare.fareClassId) return false
    return Number.isFinite(fare.pricePerPassenger)
  })
}

function isTraveller(value: unknown): value is TravellerDraft {
  if (!isRecord(value)) return false
  if (!isText(value.key) || !value.key) return false
  if (!isText(value.expectedType) || !PASSENGER_TYPES.includes(value.expectedType as PassengerType)) return false
  const fields = ['givenName', 'familyName', 'dateOfBirth', 'passportNumber', 'lapOfKey']
  if (!fields.every((field) => isText(value[field]))) return false
  return value.demoPassengerId === undefined || isText(value.demoPassengerId)
}

function isHeld(value: unknown): value is HoldBookingResponse {
  if (!isRecord(value)) return false
  if (!isText(value.bookingId) || !value.bookingId) return false
  if (!isText(value.reference) || !value.reference) return false
  if (!Number.isFinite(value.total)) return false
  if (!isText(value.currency)) return false
  return isText(value.holdExpiresAt)
}

function parseSearch(value: unknown): FlightSearchUrlState | null {
  if (!isRecord(value) || !isRecord(value.form) || !Array.isArray(value.form.legs)) return null
  const legs = value.form.legs.filter((leg) => isRecord(leg) && isText(leg.origin) && isText(leg.destination) && isText(leg.date))
  if (!legs.length) return null
  /* The picks keep their leg position: a gap stays a gap. */
  const picks = (Array.isArray(value.picks) ? value.picks : []).map((pick) =>
    isRecord(pick) && isText(pick.flightId) && isText(pick.fareClassId)
      ? { flightId: pick.flightId, fareClassId: pick.fareClassId }
      : undefined,
  )
  const form = { ...value.form, legs } as unknown as FlightSearchUrlState['form']
  const state: FlightSearchUrlState = {
    form,
    submitted: value.submitted === true,
    sort: value.sort === 'departure' || value.sort === 'duration' ? value.sort : 'price',
    picks,
  }
  try {
    const params = flightSearchParamsFromState(state)
    return flightSearchStateFromParams(parseFlightSearchParams({ ...params } as Record<string, unknown>))
  } catch {
    return null
  }
}

function parseContact(value: unknown): BookingContact {
  if (!isRecord(value)) return { email: '', phone: '', promoCode: '' }
  return {
    email: isText(value.email) ? value.email : '',
    phone: isText(value.phone) ? value.phone : '',
    promoCode: isText(value.promoCode) ? value.promoCode : '',
  }
}

function parseAttempt(value: unknown): StaffBookingAttempt | null {
  if (!isRecord(value)) return null
  if (!isText(value.body) || !value.body) return null
  if (!isText(value.key) || !value.key) return null
  return { body: value.body, key: value.key }
}

function parseStep(value: unknown, itinerary: SearchItinerary | null, held: HoldBookingResponse | null): StaffBookingStep {
  if (!isText(value) || !STEPS.includes(value as StaffBookingStep)) return 'search'
  const step = value as StaffBookingStep
  if (step === 'search') return 'search'
  if (!itinerary) return 'search'
  if (step === 'held') return held ? 'held' : 'seats'
  return step
}

export function readBookingDraft(): StaffBookingDraft | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const value: unknown = JSON.parse(stored)
    if (!isRecord(value) || value.version !== VERSION) return null
    const customerId = isText(value.customerId) ? value.customerId : ''
    const itinerary = isItinerary(value.itinerary) ? value.itinerary : null
    const held = isHeld(value.held) ? value.held : null
    const restored = Array.isArray(value.travellers) ? value.travellers.filter(isTraveller) : []
    return {
      version: VERSION,
      customerId,
      step: customerId ? parseStep(value.step, itinerary, held) : 'search',
      search: parseSearch(value.search),
      itinerary,
      travellers: itinerary ? travellersFor(itinerary, restored) : [],
      contact: parseContact(value.contact),
      held,
      attempt: parseAttempt(value.attempt),
    }
  } catch {
    return null
  }
}

export function saveBookingDraft(draft: StaffBookingDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Storage can be blocked or full; the page keeps working in memory.
  }
}

export function clearBookingDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
