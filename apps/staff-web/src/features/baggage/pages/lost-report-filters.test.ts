import assert from 'node:assert/strict'
import test from 'node:test'
import { filterLostReportCases, getFlightOriginOptions } from './lost-report-filters.ts'

const cases = [
  { id: '1', status: 'open', flightOrigin: 'BKK' },
  { id: '2', status: 'matched', flightOrigin: 'CNX' },
  { id: '3', status: 'closed', flightOrigin: 'BKK' },
]

test('flight origin options are distinct, normalized, and derived from cases', () => {
  assert.deepEqual(getFlightOriginOptions([{ flightOrigin: 'bkk ' }, { flightOrigin: 'CNX' }, { flightOrigin: 'BKK' }]), ['BKK', 'CNX'])
})

test('departure filtering composes with the selected status filter', () => {
  assert.deepEqual(
    filterLostReportCases(cases, ['open', 'matched'], 'CNX').map((item) => item.id),
    ['2'],
  )
  assert.deepEqual(
    filterLostReportCases(cases, ['open', 'matched'], undefined).map((item) => item.id),
    ['1', '2'],
  )
})
