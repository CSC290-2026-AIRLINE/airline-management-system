import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCreateLostReportFormData,
  buildCreateLostReportPayload,
  createLostReportPageState,
  isCurrentFlightLookup,
  lostReportPageReducer,
  LOST_REPORT_PHOTO_MAX_BYTES,
  validateLostReportPhoto,
  validateLostReportForm,
  type EligibleFlight,
  type LostBagFormValues,
} from './lost-report-form.ts'

const flights: EligibleFlight[] = [
  {
    flightId: '7f54f0b8-49f0-4ef5-a951-2c0de34dd22d',
    flightNumber: 'FY 117',
    serviceDate: '2026-10-18',
    origin: 'BKK',
    destination: 'SIN',
  },
]

const validValues: LostBagFormValues = {
  bookingReference: 'h8ld3q',
  surname: '  Haddad  ',
  flightId: flights[0].flightId,
  bagType: 'suitcase',
  colour: 'black',
  tagNumber: ' 0123456789 ',
  brand: ' Samsonite ',
  description: ' Silver ribbon ',
  contactEmail: ' passenger@example.com ',
  contactPhone: '',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('validates required fields, tag format, contact validation, and the selected eligible flight', () => {
  const invalid = {
    ...validValues,
    bookingReference: 'bad',
    flightId: 'another-flight-id',
    bagType: '',
    colour: '',
    tagNumber: '123',
    contactEmail: 'not-an-email',
    contactPhone: 'x',
  }

  assert.deepEqual(Object.keys(validateLostReportForm(invalid, flights)).sort(), [
    'bagType',
    'bookingReference',
    'colour',
    'contactEmail',
    'contactPhone',
    'flightId',
    'tagNumber',
  ])
  assert.equal(
    validateLostReportForm({ ...validValues, contactEmail: '', contactPhone: '' }, flights).contact,
    'Enter at least one contact method: email or phone.',
  )
})

test('maps validated fields to the passenger create payload and omits identity fields', () => {
  const payload = buildCreateLostReportPayload(validValues, flights)

  assert.deepEqual(payload, {
    bookingReference: 'H8LD3Q',
    surname: 'Haddad',
    flightId: flights[0].flightId,
    bagType: 'suitcase',
    colour: 'black',
    tagNumber: '0123456789',
    brand: 'Samsonite',
    description: 'Silver ribbon',
    contactEmail: 'passenger@example.com',
  })
  assert.equal('passengerId' in payload, false)
  assert.equal('customerId' in payload, false)
})

test('validates optional JPG and PNG photos up to exactly 10 MB', () => {
  assert.equal(validateLostReportPhoto(null), null)
  assert.equal(validateLostReportPhoto({ type: 'image/jpeg', size: LOST_REPORT_PHOTO_MAX_BYTES }), null)
  assert.equal(validateLostReportPhoto({ type: 'image/png', size: 1 }), null)
  assert.equal(validateLostReportPhoto({ type: 'image/webp', size: 1 }), 'Choose a JPG or PNG image.')
  assert.equal(validateLostReportPhoto({ type: 'image/png', size: LOST_REPORT_PHOTO_MAX_BYTES + 1 }), 'Photo must be 10 MB or smaller.')
})

test('maps report fields and the optional photo to multipart form data', () => {
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bag.jpg', { type: 'image/jpeg' })
  const formData = buildCreateLostReportFormData(validValues, flights, photo)

  assert.equal(formData.get('bookingReference'), 'H8LD3Q')
  assert.equal(formData.get('flightId'), flights[0].flightId)
  assert.equal(formData.get('photo'), photo)
  assert.equal(formData.has('passengerId'), false)
  assert.equal(formData.has('customerId'), false)
})

test('flight lookup and report submission success and error states are observable', () => {
  const initial = createLostReportPageState()
  const loading = lostReportPageReducer(initial, { type: 'flights-loading' })
  const flightsLoaded = lostReportPageReducer(loading, { type: 'flights-loaded', flights })
  assert.equal(flightsLoaded.flightState, 'loaded')
  assert.equal(flightsLoaded.flights[0].flightId, flights[0].flightId)
  const invalidated = lostReportPageReducer(flightsLoaded, { type: 'flights-reset' })
  assert.equal(invalidated.flightState, 'idle')
  assert.deepEqual(invalidated.flights, [])

  const failed = lostReportPageReducer(invalidated, { type: 'submit-failed', message: 'Server validation failed.' })
  assert.equal(failed.submitState, 'error')
  assert.equal(failed.submitError, 'Server validation failed.')

  const submitted = lostReportPageReducer(failed, { type: 'submit-started' })
  const succeeded = lostReportPageReducer(submitted, { type: 'submit-succeeded', caseNumber: 'LB-2026-000118' })
  assert.equal(succeeded.submitState, 'success')
  assert.equal(succeeded.caseNumber, 'LB-2026-000118')
})

test('a flight lookup invalidated by changed booking inputs ignores stale success, error, and cleanup', async () => {
  let currentRequestId = 1
  let currentAccess = { bookingReference: 'ABC123', surname: 'Lee' }
  let state = { flights: ['old state'], error: '', loading: true }
  const pending = deferred<string[]>()
  const request = { requestId: 1, bookingReference: 'ABC123', surname: 'Lee' }
  const isCurrent = () => isCurrentFlightLookup(request, currentRequestId, currentAccess)

  const settle = async () => {
    try {
      const result = await pending.promise
      if (isCurrent()) state.flights = result
    } catch (error) {
      if (isCurrent()) state.error = (error as Error).message
    } finally {
      if (isCurrent()) state.loading = false
    }
  }
  const lookup = settle()

  currentRequestId += 1
  currentAccess = { bookingReference: 'XYZ789', surname: 'Kim' }
  state = { flights: [], error: '', loading: false }
  pending.reject(new Error('old booking lookup failed'))
  await lookup

  assert.deepEqual(state, { flights: [], error: '', loading: false })
})

test('an older out-of-order flight result cannot replace the latest booking result', async () => {
  let currentRequestId = 1
  let currentAccess = { bookingReference: 'ABC123', surname: 'Lee' }
  const state = { flights: [] as string[] }
  const oldPending = deferred<string[]>()
  const newPending = deferred<string[]>()
  const settle = async (requestId: number, bookingReference: string, surname: string, pending: Promise<string[]>) => {
    const result = await pending
    if (isCurrentFlightLookup({ requestId, bookingReference, surname }, currentRequestId, currentAccess)) state.flights = result
  }

  const oldLookup = settle(1, 'ABC123', 'Lee', oldPending.promise)
  currentRequestId = 2
  currentAccess = { bookingReference: 'XYZ789', surname: 'Kim' }
  const newLookup = settle(2, 'XYZ789', 'Kim', newPending.promise)
  newPending.resolve(['new flight'])
  await newLookup
  oldPending.resolve(['old flight'])
  await oldLookup

  assert.deepEqual(state.flights, ['new flight'])
})

test('flight lookup generation and normalized booking inputs must both match', () => {
  const request = { requestId: 3, bookingReference: 'ABC123', surname: 'Lee' }

  assert.equal(isCurrentFlightLookup(request, 3, { bookingReference: ' abc123 ', surname: ' Lee ' }), true)
  assert.equal(isCurrentFlightLookup(request, 4, { bookingReference: 'ABC123', surname: 'Lee' }), false)
  assert.equal(isCurrentFlightLookup(request, 3, { bookingReference: 'XYZ789', surname: 'Lee' }), false)
})
