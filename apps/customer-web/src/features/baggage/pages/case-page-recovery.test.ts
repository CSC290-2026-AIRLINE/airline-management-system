import assert from 'node:assert/strict'
import test from 'node:test'
import {
  caseLookupMatchesOpenedCase,
  caseRecoveryErrorMessage,
  caseRecoveryReducer,
  caseRecoveryDetailsMatchCase,
  createCaseRecoveryState,
  extractCaseNumbers,
  normalizeCaseRecoveryAccess,
  validateCaseRecoveryAccess,
} from './case-page-recovery.ts'
import { createPassengerCasePageState, passengerCasePageReducer } from './case-page-state.ts'

test('case recovery normalizes booking details and requires both values', () => {
  const access = normalizeCaseRecoveryAccess(' ab12cd ', '  Okay  ')

  assert.deepEqual(access, { bookingReference: 'AB12CD', surname: 'Okay' })
  assert.equal(validateCaseRecoveryAccess(access), null)
  assert.match(validateCaseRecoveryAccess(normalizeCaseRecoveryAccess('bad', 'Okay')) ?? '', /six-character/)
  assert.match(validateCaseRecoveryAccess(normalizeCaseRecoveryAccess('AB12CD', '  ')) ?? '', /surname/)
})

test('editing booking details clears the previously opened case before a recovery lookup can fail', () => {
  const openedCaseAccess = { bookingReference: '2V5NHN', surname: 'Okay' }
  const openedLookup = { ...openedCaseAccess, caseNumber: 'LB-2026-000002' }
  const openedCase = passengerCasePageReducer(createPassengerCasePageState<{ caseNumber: string }, { status: string }>(), {
    type: 'report-loaded',
    report: { caseNumber: 'LB-2026-000002' },
  })

  assert.equal(caseRecoveryDetailsMatchCase(openedCaseAccess, ' 2v5nhn ', ' Okay '), true)
  assert.equal(caseRecoveryDetailsMatchCase(openedCaseAccess, '2V5NHN', 'okay'), true)
  const changedBookingMatches = caseRecoveryDetailsMatchCase(openedCaseAccess, 'ABC123', 'Okay')
  assert.equal(changedBookingMatches, false)
  const afterBookingEdit = changedBookingMatches ? openedCase : passengerCasePageReducer(openedCase, { type: 'reset' })
  assert.equal(afterBookingEdit.report, null)
  assert.equal(afterBookingEdit.delivery, null)

  assert.equal(caseRecoveryDetailsMatchCase(openedCaseAccess, '2V5NHN', 'Other'), false)
  assert.equal(caseRecoveryDetailsMatchCase(null, '2V5NHN', 'Okay'), false)
  assert.equal(caseLookupMatchesOpenedCase(openedLookup, { ...openedLookup }), true)
  assert.equal(caseLookupMatchesOpenedCase(openedLookup, { ...openedLookup, caseNumber: 'LB-2026-000003' }), false)
})

test('case recovery accepts only valid case numbers and removes duplicates', () => {
  assert.deepEqual(
    extractCaseNumbers([
      { caseNumber: 'LB-2026-000001' },
      { caseNumber: 'LB-2026-000001' },
      { caseNumber: 'not-a-case' },
      { caseNumber: 123 },
      null,
    ]),
    ['LB-2026-000001'],
  )
  assert.deepEqual(extractCaseNumbers({ caseNumber: 'LB-2026-000001' }), [])
})

test('case recovery distinguishes loading, results, empty, error, and reset states', () => {
  const loading = caseRecoveryReducer(createCaseRecoveryState(), { type: 'loading' })
  assert.equal(loading.status, 'loading')

  const results = caseRecoveryReducer(loading, { type: 'loaded', caseNumbers: ['LB-2026-000001'] })
  assert.deepEqual(results, { status: 'results', caseNumbers: ['LB-2026-000001'], message: '' })

  const empty = caseRecoveryReducer(results, { type: 'loaded', caseNumbers: [] })
  assert.equal(empty.status, 'empty')
  assert.equal(empty.message, 'No lost-baggage reports were found for this booking.')

  const error = caseRecoveryReducer(empty, { type: 'failed', message: 'Cases could not be loaded.' })
  assert.deepEqual(error, { status: 'error', caseNumbers: [], message: 'Cases could not be loaded.' })
  assert.deepEqual(caseRecoveryReducer(error, { type: 'reset' }), createCaseRecoveryState())
})

test('case recovery explains booking verification rejection and preserves other failures', () => {
  assert.equal(
    caseRecoveryErrorMessage('Booking verification failed'),
    "We couldn't verify this booking. Please check your booking reference and surname, then try again.",
  )
  assert.equal(caseRecoveryErrorMessage('The service is unavailable.'), 'The service is unavailable.')
  assert.equal(caseRecoveryErrorMessage('Network request failed'), 'Network request failed')
})
