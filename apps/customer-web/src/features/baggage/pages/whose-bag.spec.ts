import assert from 'node:assert/strict'
import test from 'node:test'
import {
  bookingPassengerIdForSubmit,
  buildCreateLostReportFormData,
  buildCreateLostReportPayload,
  createLostReportPageState,
  defaultTravellerId,
  flightsForSelection,
  lostReportPageReducer,
  selectedTravellerName,
  showTravellerSelector,
  usableTravellers,
  validateLostReportForm,
  type EligibleFlight,
  type EligibleTraveller,
  type LostBagFormValues,
} from './lost-report-form.ts'

const fy204: EligibleFlight = { flightId: 'f-204', flightNumber: 'FY 204', serviceDate: '2026-10-19', origin: 'BKK', destination: 'NRT' }
const fy310: EligibleFlight = { flightId: 'f-310', flightNumber: 'FY 310', serviceDate: '2026-10-25', origin: 'NRT', destination: 'BKK' }

const anna: EligibleTraveller = { bookingPassengerId: 'bp-anna', displayName: 'Anna Eriksson', isYou: true, flights: [fy204] }
const erik: EligibleTraveller = { bookingPassengerId: 'bp-erik', displayName: 'Erik Eriksson', isYou: false, flights: [fy204, fy310] }
const travellers = [anna, erik]
const ownFlights = [fy204]

const values: LostBagFormValues = {
  bookingReference: 'k7qx2m',
  surname: ' Eriksson ',
  flightId: fy310.flightId,
  bagType: 'suitcase',
  colour: 'black',
  tagNumber: '',
  brand: '',
  description: '',
  contactEmail: 'anna@example.com',
  contactPhone: '',
}

test('usableTravellers accepts only a well-formed list that includes the signed-in customer', () => {
  assert.deepEqual(usableTravellers(travellers), travellers)
  assert.deepEqual(usableTravellers([erik]), [], 'no isYou entry: fall back to the own-bag flow')
  assert.deepEqual(usableTravellers({ error: 'x' }), [])
  assert.deepEqual(usableTravellers(null), [])
  assert.deepEqual(usableTravellers([anna, { displayName: 'broken' }]), [anna])
})

test('the selector shows only when there is another traveller, and defaults to the signed-in customer', () => {
  assert.equal(showTravellerSelector(travellers), true)
  assert.equal(showTravellerSelector([anna]), false)
  assert.equal(showTravellerSelector([]), false)
  assert.equal(defaultTravellerId(travellers), 'bp-anna')
  assert.equal(defaultTravellerId([]), '')
})

test('own bag keeps the original flights list; another traveller gets only their flights', () => {
  assert.equal(flightsForSelection(ownFlights, travellers, 'bp-anna'), ownFlights)
  assert.equal(flightsForSelection(ownFlights, [], ''), ownFlights)
  assert.deepEqual(flightsForSelection(ownFlights, travellers, 'bp-erik'), [fy204, fy310])
  assert.equal(flightsForSelection(ownFlights, travellers, 'bp-unknown'), ownFlights)
})

test('bookingPassengerId is sent only for another traveller', () => {
  assert.equal(bookingPassengerIdForSubmit(travellers, 'bp-anna'), undefined)
  assert.equal(bookingPassengerIdForSubmit([], ''), undefined)
  assert.equal(bookingPassengerIdForSubmit(travellers, 'bp-unknown'), undefined)
  assert.equal(bookingPassengerIdForSubmit(travellers, 'bp-erik'), 'bp-erik')
  assert.equal(selectedTravellerName(travellers, 'bp-erik'), 'Erik Eriksson')
})

test('the own-bag JSON payload is unchanged (no bookingPassengerId key)', () => {
  const own = buildCreateLostReportPayload(
    { ...values, flightId: fy204.flightId },
    ownFlights,
    bookingPassengerIdForSubmit(travellers, 'bp-anna'),
  )

  assert.equal('bookingPassengerId' in own, false)
  assert.deepEqual(own, {
    bookingReference: 'K7QX2M',
    surname: 'Eriksson',
    flightId: 'f-204',
    bagType: 'suitcase',
    colour: 'black',
    contactEmail: 'anna@example.com',
  })
})

test('the co-traveller payload adds bookingPassengerId and validates against their flights', () => {
  const erikFlights = flightsForSelection(ownFlights, travellers, 'bp-erik')
  assert.deepEqual(validateLostReportForm(values, erikFlights), {})
  assert.equal(validateLostReportForm(values, ownFlights).flightId, 'Select a flight from the eligible flights.')

  const payload = buildCreateLostReportPayload(values, erikFlights, 'bp-erik')
  assert.equal(payload.bookingPassengerId, 'bp-erik')
  assert.equal(payload.flightId, 'f-310')
  assert.equal('passengerId' in payload, false)
})

test('multipart (photo) submission carries bookingPassengerId only for another traveller', () => {
  const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bag.jpg', { type: 'image/jpeg' })
  const erikFlights = flightsForSelection(ownFlights, travellers, 'bp-erik')

  assert.equal(buildCreateLostReportFormData(values, erikFlights, photo, 'bp-erik').get('bookingPassengerId'), 'bp-erik')
  assert.equal(buildCreateLostReportFormData({ ...values, flightId: 'f-204' }, ownFlights, photo).has('bookingPassengerId'), false)
})

test('reducer: travellers load with the customer selected, selection is validated, and lookups reset it', () => {
  const loaded = lostReportPageReducer(
    lostReportPageReducer(createLostReportPageState(), { type: 'flights-loaded', flights: ownFlights }),
    { type: 'travellers-loaded', travellers },
  )
  assert.equal(loaded.selectedTravellerId, 'bp-anna')

  const erikSelected = lostReportPageReducer(loaded, { type: 'traveller-selected', bookingPassengerId: 'bp-erik' })
  assert.equal(erikSelected.selectedTravellerId, 'bp-erik')
  assert.equal(lostReportPageReducer(erikSelected, { type: 'traveller-selected', bookingPassengerId: 'bp-forged' }), erikSelected)

  for (const action of [{ type: 'flights-loading' }, { type: 'flights-reset' }, { type: 'reset' }] as const) {
    const cleared = lostReportPageReducer(erikSelected, action)
    assert.deepEqual(cleared.travellers, [])
    assert.equal(cleared.selectedTravellerId, '')
  }
  const failed = lostReportPageReducer(erikSelected, { type: 'flights-failed', message: 'x' })
  assert.deepEqual(failed.travellers, [])
})

test('a successful submission keeps the selected traveller for the success page', () => {
  const erikSelected = lostReportPageReducer(
    lostReportPageReducer(createLostReportPageState(), { type: 'travellers-loaded', travellers }),
    {
      type: 'traveller-selected',
      bookingPassengerId: 'bp-erik',
    },
  )
  const done = lostReportPageReducer(lostReportPageReducer(erikSelected, { type: 'submit-started' }), {
    type: 'submit-succeeded',
    caseNumber: 'LB-2026-000200',
  })

  assert.equal(selectedTravellerName(done.travellers, done.selectedTravellerId), 'Erik Eriksson')
})
