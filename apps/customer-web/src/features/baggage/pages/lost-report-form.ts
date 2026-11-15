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

export const LOST_REPORT_PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const LOST_REPORT_PHOTO_ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png'

export function validateLostReportPhoto(file: Pick<File, 'type' | 'size'> | null): string | null {
  if (!file) return null
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Choose a JPG or PNG image.'
  if (file.size > LOST_REPORT_PHOTO_MAX_BYTES) return 'Photo must be 10 MB or smaller.'
  return null
}

export interface EligibleFlight {
  flightId: string
  flightNumber: string
  serviceDate: string
  origin: string
  destination: string
}

/** A traveller on the verified booking (GET /api/customer/lost-report-travellers). */
export interface EligibleTraveller {
  bookingPassengerId: string
  displayName: string
  isYou: boolean
  flights: EligibleFlight[]
}

/** Accept a traveller list only when it includes the signed-in customer; anything else falls back to the own-bag flow. */
export function usableTravellers(value: unknown): EligibleTraveller[] {
  if (!Array.isArray(value)) return []
  const travellers = value.filter(
    (item): item is EligibleTraveller =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as EligibleTraveller).bookingPassengerId === 'string' &&
      typeof (item as EligibleTraveller).displayName === 'string' &&
      typeof (item as EligibleTraveller).isYou === 'boolean' &&
      Array.isArray((item as EligibleTraveller).flights),
  )
  return travellers.some((traveller) => traveller.isYou) ? travellers : []
}

/** "Whose bag is it?" is shown only when there is someone other than the signed-in customer to choose. */
export function showTravellerSelector(travellers: EligibleTraveller[]): boolean {
  return travellers.length > 1 && travellers.some((traveller) => traveller.isYou)
}

export function defaultTravellerId(travellers: EligibleTraveller[]): string {
  return travellers.find((traveller) => traveller.isYou)?.bookingPassengerId ?? ''
}

function selectedCoTraveller(travellers: EligibleTraveller[], selectedTravellerId: string): EligibleTraveller | undefined {
  const selected = travellers.find((traveller) => traveller.bookingPassengerId === selectedTravellerId)
  return selected && !selected.isYou ? selected : undefined
}

/** Own bag: the original eligible-flights list, unchanged. Another traveller: only that traveller's confirmed flights. */
export function flightsForSelection(
  ownFlights: EligibleFlight[],
  travellers: EligibleTraveller[],
  selectedTravellerId: string,
): EligibleFlight[] {
  return selectedCoTraveller(travellers, selectedTravellerId)?.flights ?? ownFlights
}

/** Sent only when reporting for another traveller, so the own-bag request stays exactly as before. */
export function bookingPassengerIdForSubmit(travellers: EligibleTraveller[], selectedTravellerId: string): string | undefined {
  return selectedCoTraveller(travellers, selectedTravellerId)?.bookingPassengerId
}

export function selectedTravellerName(travellers: EligibleTraveller[], selectedTravellerId: string): string | null {
  return travellers.find((traveller) => traveller.bookingPassengerId === selectedTravellerId)?.displayName ?? null
}

export interface BookingFlightSummary {
  bookingReference: string
  flightNumber: string
  serviceDate: string
  origin: string
  destination: string
}

export function buildBookingFlightSummary(bookingReference: string, flight: EligibleFlight | undefined): BookingFlightSummary | null {
  if (!flight) return null

  return {
    bookingReference: bookingReference.trim().toUpperCase(),
    flightNumber: flight.flightNumber,
    serviceDate: flight.serviceDate,
    origin: flight.origin,
    destination: flight.destination,
  }
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
  /** Only when reporting for another traveller on the booking. */
  bookingPassengerId?: string
}

export type LostReportPageState = {
  flightState: 'idle' | 'loading' | 'loaded' | 'error'
  flights: EligibleFlight[]
  flightError: string
  /** Travellers on the found booking; empty means the original own-bag flow. */
  travellers: EligibleTraveller[]
  selectedTravellerId: string
  submitState: 'idle' | 'submitting' | 'success' | 'error'
  submitError: string
  caseNumber: string
}

export type LostReportPageAction =
  | { type: 'flights-loading' }
  | { type: 'flights-loaded'; flights: EligibleFlight[] }
  | { type: 'flights-failed'; message: string }
  | { type: 'flights-reset' }
  | { type: 'travellers-loaded'; travellers: EligibleTraveller[] }
  | { type: 'traveller-selected'; bookingPassengerId: string }
  | { type: 'submit-started' }
  | { type: 'submit-succeeded'; caseNumber: string }
  | { type: 'submit-failed'; message: string }
  | { type: 'reset' }

export function createLostReportPageState(): LostReportPageState {
  return {
    flightState: 'idle',
    flights: [],
    flightError: '',
    travellers: [],
    selectedTravellerId: '',
    submitState: 'idle',
    submitError: '',
    caseNumber: '',
  }
}

export function lostReportPageReducer(state: LostReportPageState, action: LostReportPageAction): LostReportPageState {
  switch (action.type) {
    case 'flights-loading':
      return { ...state, flightState: 'loading', flights: [], flightError: '', travellers: [], selectedTravellerId: '', submitError: '' }
    case 'flights-loaded':
      return { ...state, flightState: 'loaded', flights: action.flights, flightError: '' }
    case 'flights-failed':
      return { ...state, flightState: 'error', flights: [], flightError: action.message, travellers: [], selectedTravellerId: '' }
    case 'flights-reset':
      return {
        ...state,
        flightState: 'idle',
        flights: [],
        flightError: '',
        travellers: [],
        selectedTravellerId: '',
        submitState: 'idle',
        submitError: '',
        caseNumber: '',
      }
    case 'travellers-loaded':
      return { ...state, travellers: action.travellers, selectedTravellerId: defaultTravellerId(action.travellers) }
    case 'traveller-selected':
      return state.travellers.some((traveller) => traveller.bookingPassengerId === action.bookingPassengerId)
        ? { ...state, selectedTravellerId: action.bookingPassengerId }
        : state
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

export function buildCreateLostReportPayload(
  values: LostBagFormValues,
  flights: EligibleFlight[],
  bookingPassengerId?: string,
): CreateLostReportPayload {
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
  if (bookingPassengerId) payload.bookingPassengerId = bookingPassengerId

  return payload
}

export interface ObjectUrlApi {
  create(file: Blob): string
  revoke(url: string): void
}

/** A temporary browser URL for showing a selected photo before it is uploaded. */
export interface PhotoPreview {
  url: string
  /** Frees the URL. Safe to call more than once; it is revoked only the first time. */
  release(): void
}

const BROWSER_OBJECT_URLS: ObjectUrlApi = {
  create: (file) => URL.createObjectURL(file),
  revoke: (url) => URL.revokeObjectURL(url),
}

/** Call only for a photo validateLostReportPhoto accepted, and only from an event handler (never during render). */
export function createPhotoPreview(file: Blob, urls: ObjectUrlApi = BROWSER_OBJECT_URLS): PhotoPreview {
  const url = urls.create(file)
  let released = false
  return {
    url,
    release() {
      if (released) return
      released = true
      urls.revoke(url)
    },
  }
}

export function buildCreateLostReportFormData(
  values: LostBagFormValues,
  flights: EligibleFlight[],
  photo: File,
  bookingPassengerId?: string,
): FormData {
  const payload = buildCreateLostReportPayload(values, flights, bookingPassengerId)
  const formData = new FormData()
  for (const [key, value] of Object.entries(payload)) formData.append(key, value)
  formData.append('photo', photo)
  return formData
}

// ---------------------------------------------------------------------------------------------------------------------
// Guest (no-account) reporting. The mode follows Clerk's sign-in state only; guest data never carries server ids for the
// flight, and the bag owner is the traveller the guest picks, re-verified by the server on submission.

export type ReportingMode = 'customer' | 'guest' | 'pending'

/**
 * Signed in with Clerk: the authenticated customer flow, even when the app session exchange later fails (that shows the
 * customer flow's own error; it never falls back to guest). Signed out: guest. Not loaded yet: decide nothing.
 */
export function reportingModeFor(clerk: { isLoaded: boolean; isSignedIn: boolean | null | undefined }): ReportingMode {
  if (!clerk.isLoaded) return 'pending'
  return clerk.isSignedIn ? 'customer' : 'guest'
}

/** A flight from the guest endpoints: number + date identify it; the server sends no flight id. */
export interface GuestFlight {
  flightNumber: string
  serviceDate: string
  origin: string
  destination: string
}

/** POST /api/guest/lost-reports success body. */
export interface GuestReportResult {
  caseNumber: string
  status: string
  flightNumber: string
  serviceDate: string
  bagType: PassengerBagType
  colour: PassengerBagColour
  tagNumber: string | null
}

/** A local-only key for the flight select. Never sent to the server. */
export function guestFlightKey(flight: Pick<GuestFlight, 'flightNumber' | 'serviceDate'>): string {
  return `guest:${flight.flightNumber}:${flight.serviceDate}`
}

function isGuestFlight(value: unknown): value is GuestFlight {
  if (typeof value !== 'object' || value === null) return false
  const flight = value as Record<string, unknown>
  return (
    typeof flight.flightNumber === 'string' &&
    typeof flight.serviceDate === 'string' &&
    typeof flight.origin === 'string' &&
    typeof flight.destination === 'string'
  )
}

function toEligibleGuestFlight(flight: GuestFlight): EligibleFlight {
  return {
    flightId: guestFlightKey(flight),
    flightNumber: flight.flightNumber,
    serviceDate: flight.serviceDate,
    origin: flight.origin,
    destination: flight.destination,
  }
}

/** POST /api/guest/lost-report-flights body, mapped for the form. */
export function usableGuestFlights(value: unknown): EligibleFlight[] {
  return Array.isArray(value) ? value.filter(isGuestFlight).map(toEligibleGuestFlight) : []
}

/**
 * POST /api/guest/lost-report-travellers body, mapped for "Whose bag is it?". Each traveller keeps their own flights, so
 * only a flight that traveller holds can be selected for them.
 */
export function usableGuestTravellers(value: unknown): EligibleTraveller[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is { travellerId: string; displayName: string; flights: unknown[] } =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).travellerId === 'string' &&
        typeof (item as Record<string, unknown>).displayName === 'string' &&
        Array.isArray((item as Record<string, unknown>).flights),
    )
    .map((item) => ({
      bookingPassengerId: item.travellerId,
      displayName: item.displayName,
      isYou: false,
      flights: item.flights.filter(isGuestFlight).map(toEligibleGuestFlight),
    }))
    .filter((traveller) => traveller.flights.length > 0)
}

/** Guests always choose whose bag it is; until they do, no flight is offered. */
export function guestFlightsForSelection(travellers: EligibleTraveller[], selectedTravellerId: string): EligibleFlight[] {
  return travellers.find((traveller) => traveller.bookingPassengerId === selectedTravellerId)?.flights ?? []
}

/** One traveller: chosen for the guest. Several: the guest picks. */
export function defaultGuestTravellerId(travellers: EligibleTraveller[]): string {
  return travellers.length === 1 ? travellers[0].bookingPassengerId : ''
}

/** The guest form's own errors: the field rules, a chosen traveller, and a flight that traveller holds. */
export function validateGuestLostReportForm(
  values: LostBagFormValues,
  travellers: EligibleTraveller[],
  selectedTravellerId: string,
): Record<string, string> {
  const errors = validateLostReportForm(values, guestFlightsForSelection(travellers, selectedTravellerId))
  if (!travellers.some((traveller) => traveller.bookingPassengerId === selectedTravellerId)) {
    errors.traveller = 'Choose whose bag it is.'
  }
  return errors
}

/**
 * The guest report as multipart form data, with the backend DTO's field names. The flight is sent as its number and
 * date, taken from the selected traveller's own flights; flightId, bookingPassengerId and passengerId are never sent.
 */
export function buildGuestLostReportFormData(
  values: LostBagFormValues,
  travellers: EligibleTraveller[],
  selectedTravellerId: string,
  photo: File | null,
): FormData {
  if (Object.keys(validateGuestLostReportForm(values, travellers, selectedTravellerId)).length > 0) {
    throw new Error('Cannot create a guest lost report from invalid form values.')
  }
  const flight = guestFlightsForSelection(travellers, selectedTravellerId).find((item) => item.flightId === values.flightId)
  if (!flight) throw new Error('The selected flight does not belong to the selected traveller.')

  const formData = new FormData()
  formData.append('bookingReference', values.bookingReference.trim().toUpperCase())
  formData.append('surname', values.surname.trim())
  formData.append('travellerId', selectedTravellerId)
  formData.append('flightNumber', flight.flightNumber)
  formData.append('serviceDate', flight.serviceDate)
  formData.append('bagType', values.bagType)
  formData.append('colour', values.colour)
  const optional: Array<[string, string]> = [
    ['tagNumber', values.tagNumber],
    ['brand', values.brand],
    ['description', values.description],
    ['contactEmail', values.contactEmail],
    ['contactPhone', values.contactPhone],
  ]
  for (const [key, value] of optional) {
    const trimmed = value.trim()
    if (trimmed) formData.append(key, trimmed)
  }
  if (photo) formData.append('photo', photo)
  return formData
}

/** Accepts only the minimal guest success body. */
export function parseGuestReportResult(value: unknown): GuestReportResult | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  if (
    typeof body.caseNumber !== 'string' ||
    !body.caseNumber ||
    typeof body.status !== 'string' ||
    typeof body.flightNumber !== 'string' ||
    typeof body.serviceDate !== 'string' ||
    !PASSENGER_BAG_TYPES.some(([type]) => type === body.bagType) ||
    !PASSENGER_BAG_COLOURS.some(([colour]) => colour === body.colour) ||
    !(body.tagNumber === null || typeof body.tagNumber === 'string')
  ) {
    return null
  }
  return {
    caseNumber: body.caseNumber,
    status: body.status,
    flightNumber: body.flightNumber,
    serviceDate: body.serviceDate,
    bagType: body.bagType as PassengerBagType,
    colour: body.colour as PassengerBagColour,
    tagNumber: body.tagNumber,
  }
}

/** Shown after a guest report. It claims nothing that did not happen (no email is promised). */
export const GUEST_CONFIRMATION_NOTE =
  'Save this case number. Quote it with your booking reference and surname whenever you contact airline staff about this bag.'

/**
 * My bag case (/lost-bag-case) is a signed-in page, so guests are offered neither way into it. Guests instead get the
 * public, read-only guest case tracking page (prefilled with the case number only).
 */
export function caseAccessActionsFor(mode: 'customer' | 'guest'): {
  openCreatedCase: boolean
  checkMyCase: boolean
  guestCaseTracking: boolean
} {
  const signedIn = mode === 'customer'
  return { openCreatedCase: signedIn, checkMyCase: signedIn, guestCaseTracking: !signedIn }
}

/** The guest confirmation banner: states only what happened (the report was received), not that anything was emailed. */
export const GUEST_SUCCESS_MESSAGE = 'Report sent successfully.'
