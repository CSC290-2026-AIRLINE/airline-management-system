import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CANCELLATION_UNAVAILABLE_MESSAGE,
  canReportBagFoundByPassenger,
  caseProgressPresentation,
  caseStatusLabel,
  shouldShowCancellationUnavailable,
  shouldShowNoOpenCase,
} from './case-page-presentation.ts'

test('open cases stay Open and use the searching progress stages', () => {
  assert.equal(caseStatusLabel('open', null), 'Open')
  assert.deepEqual(caseProgressPresentation('open', null), {
    steps: ['Searching', 'Bag found', 'On its way', 'Back with you'],
    activeStep: 0,
  })
  assert.equal(canReportBagFoundByPassenger('open'), true)
})

test('lost cases are distinct and show only confirmed timeout progress', () => {
  assert.equal(caseStatusLabel('lost', null), 'Lost')
  assert.deepEqual(caseProgressPresentation('lost', null), {
    steps: ['Reported', 'Not found in 21 days'],
    activeStep: 1,
  })
  assert.equal(canReportBagFoundByPassenger('matched'), false)
  assert.equal(canReportBagFoundByPassenger('delivering'), false)
})

test('the passenger can cancel an open or lost case only before staff confirm the bag', () => {
  assert.equal(canReportBagFoundByPassenger('open', null), true)
  assert.equal(canReportBagFoundByPassenger('lost', null), true)
  // A delivery record exists only after confirmation, so it closes cancellation even if the status lags behind.
  assert.equal(canReportBagFoundByPassenger('open', 'waiting_choice'), false)
  assert.equal(canReportBagFoundByPassenger('lost', 'preparing'), false)
  for (const status of ['matched', 'delivering', 'closed', 'cancelled']) {
    assert.equal(canReportBagFoundByPassenger(status, null), false, status)
  }
})

test('the contact-staff message shows only after ownership is confirmed and while recovery is still under way', () => {
  for (const [status, deliveryStatus] of [
    ['matched', 'waiting_choice'],
    ['matched', 'preparing'],
    ['matched', null],
    ['delivering', 'in_transit'],
    ['delivering', 'ready_for_pickup'],
    ['lost', 'preparing'],
  ] as const) {
    assert.equal(shouldShowCancellationUnavailable(status, deliveryStatus), true, `${status}/${deliveryStatus}`)
  }
  for (const [status, deliveryStatus] of [
    ['open', null],
    ['lost', null],
    ['cancelled', null],
    ['closed', 'delivered'],
    ['delivering', 'delivered'],
  ] as const) {
    assert.equal(shouldShowCancellationUnavailable(status, deliveryStatus), false, `${status}/${deliveryStatus}`)
  }
  // Wherever the cancel control shows, the message does not, and the other way round.
  for (const status of ['open', 'lost', 'matched', 'delivering']) {
    assert.equal(canReportBagFoundByPassenger(status, null) && shouldShowCancellationUnavailable(status, null), false, status)
  }
})

test('the contact-staff message is generic text with no contact details or links', () => {
  assert.match(CANCELLATION_UNAVAILABLE_MESSAGE, /contact airline staff/)
  assert.doesNotMatch(CANCELLATION_UNAVAILABLE_MESSAGE, /@|https?:|www\.|\+?\d[\d\s-]{6,}/)
})

test('delivery lifecycle states take precedence if an older lost report later progresses', () => {
  assert.equal(caseStatusLabel('lost', 'in_transit'), 'Being delivered')
  assert.deepEqual(caseProgressPresentation('lost', 'in_transit'), {
    steps: ['Searching', 'Bag found', 'On its way', 'Back with you'],
    activeStep: 2,
  })
  assert.equal(caseStatusLabel('lost', 'delivered'), 'Back with you')
})

test('the no-case presentation appears only when no case is open and lookup is idle without an error', () => {
  assert.equal(shouldShowNoOpenCase(false, false, false), true)
  assert.equal(shouldShowNoOpenCase(false, true, false), false)
  assert.equal(shouldShowNoOpenCase(false, false, true), false)
  assert.equal(shouldShowNoOpenCase(true, false, false), false)
})
