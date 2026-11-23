// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FlightSummary, StaffCheckInRow } from '../api/types.ts'
import { applyFilter, fallbackQuery, parseSearch, rowAction } from './counter-search.ts'

const flights = [
  { id: 'f1', flightNumber: 'FY 204' },
  { id: 'f2', flightNumber: 'FY 318' },
] as FlightSummary[]

const row = (over: Partial<StaffCheckInRow>): StaffCheckInRow => ({
  id: 'r',
  bookingPassengerId: 'bp',
  flightId: 'f1',
  seat: null,
  pnr: 'K7QX2M',
  passengerName: 'Narong Sukjai',
  flightNumber: 'FY 204',
  status: 'checked_in',
  issues: [],
  ...over,
})

test('parseSearch: a flight number selects the flight', () => {
  assert.deepEqual(parseSearch('fy 204', flights), { flightId: 'f1' })
})

test('parseSearch: six alphanumerics are a PNR', () => {
  assert.deepEqual(parseSearch(' k7qx2m ', flights), { pnr: 'K7QX2M' })
})

test('parseSearch: anything else is a surname', () => {
  assert.deepEqual(parseSearch('Eriksson', flights), { name: 'Eriksson' })
})

test('parseSearch: empty text searches everything', () => {
  assert.deepEqual(parseSearch('   ', flights), {})
})

test('applyFilter: issues keeps rows with at least one issue', () => {
  const rows = [row({ id: 'a', issues: ['NAME_MISMATCH'] }), row({ id: 'b', issues: [] })]
  assert.deepEqual(
    applyFilter(rows, 'issues').map((item) => item.id),
    ['a'],
  )
})

test('applyFilter: on_hold keeps status on_hold only', () => {
  const rows = [row({ id: 'a', status: 'on_hold' }), row({ id: 'b', status: 'checked_in' })]
  assert.deepEqual(
    applyFilter(rows, 'on_hold').map((item) => item.id),
    ['a'],
  )
})

test('applyFilter: not_started leaves out a checked-in passenger', () => {
  const rows = [row({ id: 'a', status: 'started' }), row({ id: 'b', status: 'checked_in' })]
  assert.deepEqual(
    applyFilter(rows, 'not_started').map((item) => item.id),
    ['a'],
  )
})

test('fallbackQuery: a booking ref that finds nobody is searched as a surname', () => {
  assert.deepEqual(fallbackQuery({ pnr: 'BECKER' }, 'Becker'), { name: 'Becker' })
  assert.equal(fallbackQuery({ name: 'Eriksson' }, 'Eriksson'), null)
})

test('applyFilter: "not checked in" is the booked passengers without a pass, started or not', () => {
  const rows = [
    row({ id: null, status: 'not_started' }),
    row({ id: 'a', status: 'started' }),
    row({ id: 'b', status: 'checked_in' }),
    row({ id: 'c', status: 'on_hold' }),
  ]
  assert.deepEqual(
    applyFilter(rows, 'not_started').map((item) => item.status),
    ['not_started', 'started'],
  )
})

test('rowAction: a passenger nobody checked in is started, an open check-in is continued, the rest is opened', () => {
  assert.equal(rowAction(row({ id: null, status: 'not_started' })), 'Start')
  assert.equal(rowAction(row({ status: 'started' })), 'Continue')
  assert.equal(rowAction(row({ status: 'checked_in' })), 'Open')
})
