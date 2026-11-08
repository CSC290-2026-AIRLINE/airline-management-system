export const PASSENGER_BAG_TYPES = [
  ['suitcase', 'Suitcase'],
  ['backpack', 'Backpack'],
  ['duffel', 'Duffel bag'],
  ['box', 'Box'],
  ['garment_bag', 'Garment bag'],
  ['sports_equipment', 'Sports equipment'],
  ['stroller', 'Stroller'],
  ['other', 'Other'],
] as const

export const PASSENGER_BAG_COLOURS = [
  ['black', 'Black'],
  ['white', 'White'],
  ['grey', 'Grey'],
  ['blue', 'Blue'],
  ['red', 'Red'],
  ['green', 'Green'],
  ['yellow', 'Yellow'],
  ['orange', 'Orange'],
  ['pink', 'Pink'],
  ['purple', 'Purple'],
  ['brown', 'Brown'],
  ['beige', 'Beige'],
  ['multi', 'Multiple colours'],
] as const

export type PassengerBagType = (typeof PASSENGER_BAG_TYPES)[number][0]
export type PassengerBagColour = (typeof PASSENGER_BAG_COLOURS)[number][0]

export interface EligibleFlight {
  flightId: string
  flightNumber: string
  serviceDate: string
  origin: string
  destination: string
}

export interface CaseAccess {
  caseNumber: string
  bookingReference: string
  surname: string
}

export interface FlightLookupRequest {
  requestId: number
  bookingReference: string
  surname: string
}

export interface FlightLookupAccess {
  bookingReference: string
  surname: string
}

export function isCurrentFlightLookup(request: FlightLookupRequest, currentRequestId: number, currentAccess: FlightLookupAccess): boolean {
  return (
    request.requestId === currentRequestId &&
    request.bookingReference === currentAccess.bookingReference.trim().toUpperCase() &&
    request.surname === currentAccess.surname.trim()
  )
}

export interface LostBagFormValues {
  bookingReference: string
  surname: string
  flightId: string
  bagType: string
  colour: string
  tagNumber: string
  brand: string
  description: string
  contactEmail: string
  contactPhone: string
}

export interface CreateLostReportPayload {
  bookingReference: string
  surname: string
  flightId: string
  bagType: PassengerBagType
  colour: PassengerBagColour
  tagNumber?: string
  brand?: string
  description?: string
  contactEmail?: string
  contactPhone?: string
}

export type LostReportPageState = {
  flightState: 'idle' | 'loading' | 'loaded' | 'error'
  flights: EligibleFlight[]
  flightError: string
  submitState: 'idle' | 'submitting' | 'success' | 'error'
  submitError: string
  caseNumber: string
}

export type LostReportPageAction =
  | { type: 'flights-loading' }
  | { type: 'flights-loaded'; flights: EligibleFlight[] }
  | { type: 'flights-failed'; message: string }
  | { type: 'flights-reset' }
  | { type: 'submit-started' }
  | { type: 'submit-succeeded'; caseNumber: string }
  | { type: 'submit-failed'; message: string }
  | { type: 'reset' }

export function createLostReportPageState(): LostReportPageState {
  return { flightState: 'idle', flights: [], flightError: '', submitState: 'idle', submitError: '', caseNumber: '' }
}

export function lostReportPageReducer(state: LostReportPageState, action: LostReportPageAction): LostReportPageState {
  switch (action.type) {
    case 'flights-loading':
      return { ...state, flightState: 'loading', flights: [], flightError: '', submitError: '' }
    case 'flights-loaded':
      return { ...state, flightState: 'loaded', flights: action.flights, flightError: '' }
    case 'flights-failed':
      return { ...state, flightState: 'error', flights: [], flightError: action.message }
    case 'flights-reset':
      return { ...state, flightState: 'idle', flights: [], flightError: '', submitState: 'idle', submitError: '', caseNumber: '' }
    case 'submit-started':
      return { ...state, submitState: 'submitting', submitError: '', caseNumber: '' }
    case 'submit-succeeded':
      return { ...state, submitState: 'success', caseNumber: action.caseNumber, submitError: '' }
    case 'submit-failed':
      return { ...state, submitState: 'error', submitError: action.message }
    case 'reset':
      return createLostReportPageState()
  }
}

export function validateLostReportForm(values: LostBagFormValues, flights: EligibleFlight[]): Record<string, string> {
  const errors: Record<string, string> = {}
  const bookingReference = values.bookingReference.trim()
  const surname = values.surname.trim()
  const tagNumber = values.tagNumber.trim()
  const brand = values.brand.trim()
  const description = values.description.trim()
  const email = values.contactEmail.trim()
  const phone = values.contactPhone.trim()

  if (!/^[A-Za-z0-9]{6}$/.test(bookingReference)) errors.bookingReference = 'Enter a valid six-character booking reference.'
  if (!surname) errors.surname = 'Enter the surname on the booking.'
  else if (surname.length > 100) errors.surname = 'Surname must be 100 characters or fewer.'
  if (!flights.some((flight) => flight.flightId === values.flightId)) errors.flightId = 'Select a flight from the eligible flights.'
  if (!PASSENGER_BAG_TYPES.some(([type]) => type === values.bagType)) errors.bagType = 'Select a bag type.'
  if (!PASSENGER_BAG_COLOURS.some(([colour]) => colour === values.colour)) errors.colour = 'Select the bag colour.'
  if (tagNumber && !/^0\d{9}$/.test(tagNumber)) errors.tagNumber = 'Enter a 10-digit tag number starting with 0.'
  if (brand.length > 100) errors.brand = 'Brand must be 100 characters or fewer.'
  if (description.length > 1000) errors.description = 'Description must be 1,000 characters or fewer.'
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.contactEmail = 'Enter a valid email address.'
  if (phone && !/^\+?[0-9 ()-]{6,30}$/.test(phone)) errors.contactPhone = 'Enter a valid phone number.'
  if (!email && !phone) errors.contact = 'Enter at least one contact method: email or phone.'

  return errors
}

export function buildCreateLostReportPayload(values: LostBagFormValues, flights: EligibleFlight[]): CreateLostReportPayload {
  const errors = validateLostReportForm(values, flights)
  if (Object.keys(errors).length > 0) throw new Error('Cannot create a lost report from invalid form values.')

  const payload: CreateLostReportPayload = {
    bookingReference: values.bookingReference.trim().toUpperCase(),
    surname: values.surname.trim(),
    flightId: values.flightId,
    bagType: values.bagType as PassengerBagType,
    colour: values.colour as PassengerBagColour,
  }
  const optional: Array<[keyof CreateLostReportPayload, string]> = [
    ['tagNumber', values.tagNumber],
    ['brand', values.brand],
    ['description', values.description],
    ['contactEmail', values.contactEmail],
    ['contactPhone', values.contactPhone],
  ]
  for (const [key, value] of optional) {
    const trimmed = value.trim()
    if (trimmed) Object.assign(payload, { [key]: trimmed })
  }

  return payload
}
