import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCreateLostReportPayload,
  createLostReportPageState,
  lostReportPageReducer,
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
