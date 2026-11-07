// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CheckedBagView, StaffCheckInRow } from '../api/types.ts'
import { bagLabel, bookingName, dueBags, groupIssues } from './issues.ts'

const row = (over: Partial<StaffCheckInRow>): StaffCheckInRow => ({
  id: 'r',
  pnr: 'K7QX2M',
  passengerName: 'Narong Sukjai',
  flightNumber: 'FY 204',
  status: 'checked_in',
  issues: [],
  ...over,
})

const bag = (over: Partial<CheckedBagView>): CheckedBagView => ({
  id: 'b1',
  checkInId: 'c1',
  weightKg: 12,
  excessKg: 10.5,
  ratePerKg: 500,
  excessFee: 5250,
  excessPaymentId: null,
  tagNumber: null,
  status: 'weighed',
  weighedAt: '2026-11-11T01:00:00.000Z',
  ...over,
})

test('groupIssues splits by issue code and keeps a row in both groups when it has both', () => {
  const a = row({ id: 'a', issues: ['NAME_MISMATCH'] })
  const b = row({ id: 'b', issues: ['EXCESS_UNPAID'] })
  const c = row({ id: 'c', issues: ['NAME_MISMATCH', 'EXCESS_UNPAID'] })
  const d = row({ id: 'd', issues: [] })
  const g = groupIssues([a, b, c, d])
  assert.deepEqual(
    g.mismatches.map((r) => r.id),
    ['a', 'c'],
  )
  assert.deepEqual(
    g.unpaid.map((r) => r.id),
    ['b', 'c'],
  )
})

test('groupIssues leaves out the issues this page does not show', () => {
  const g = groupIssues([row({ id: 'a', issues: ['ON_HOLD'] }), row({ id: 'b', issues: ['VISA_CHECK'] })])
  assert.deepEqual(g.mismatches, [])
  assert.deepEqual(g.unpaid, [])
})

test('bookingName reads the name the way the passport does: surname first', () => {
  assert.equal(bookingName({ firstName: 'Pim', lastName: 'Saetang' }), 'SAETANG/PIM')
  assert.equal(bookingName({ firstName: 'Chen', lastName: 'Wei' }), 'WEI/CHEN')
})

test('dueBags keeps the bags whose fee is not paid, with the number they carry in the bag list', () => {
  const bags = [bag({ id: 'b1', excessKg: 0, excessFee: 0 }), bag({ id: 'b2' }), bag({ id: 'b3', excessPaymentId: 'pay-1' })]
  assert.deepEqual(
    dueBags(bags).map((entry) => entry.number),
    [2],
  )
})

test('bagLabel names the bag and the excess it added', () => {
  assert.equal(bagLabel({ number: 2, bag: bag({}) }), 'Bag 2 · 10.5 kg excess')
})
