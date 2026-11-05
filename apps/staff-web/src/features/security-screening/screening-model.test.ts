import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { screeningFixtures } from './mock-data.ts'
import {
  appendReview,
  displayStatus,
  formatDeparture,
  isPending,
  isUrgent,
  latestReview,
  queueCounts,
  remainingTime,
  reviewHistory,
  selectQueue,
  simulationNow,
  sourceLabel,
} from './screening-model.ts'
import type { ScreeningRecord } from './types'

const [somsak, arthit, maya] = screeningFixtures
const confirmed = { decision: 'confirmed' as const, note: 'Passport and nationality checked in person.', passportCompared: true }
const released = { decision: 'false_positive' as const, note: 'Passport differs from the entry.', passportCompared: true }

test('review appends without changing the original held check or screening snapshot', () => {
  const original = structuredClone(somsak)
  const reviewed = appendReview(somsak, confirmed)
  assert.deepEqual(somsak, original)
  assert.equal(reviewed.outcome, 'held')
  assert.equal(reviewed.occurredAt, somsak.occurredAt)
  assert.strictEqual(reviewed.comparison, somsak.comparison)
  assert.strictEqual(reviewed.history, somsak.history)
  assert.equal(displayStatus(reviewed), 'Confirmed')
  assert.equal(latestReview(reviewed)?.authorityNotifiedAt, simulationNow)
  assert.equal(isPending(reviewed), false)
})

test('a corrected decision adds a review on the SAME check and retains both notes', () => {
  const first = appendReview(somsak, confirmed)
  const second = appendReview(first, released)
  assert.equal(second.id, somsak.id)
  assert.equal(second.reviews.length, 2)
  assert.equal(second.outcome, 'held')
  assert.equal(displayStatus(second), 'Released')
  assert.equal(second.reviews[0].decision, 'confirmed')
  assert.equal(second.reviews[1].decision, 'false_positive')
  assert.ok(second.reviews[0].authorityNotifiedAt)
  assert.equal(second.reviews[1].authorityNotifiedAt, undefined)
  assert.ok(reviewHistory(second).some((row) => row[4].includes(confirmed.note)))
  assert.ok(reviewHistory(second).some((row) => row[4].includes(released.note)))
})

test('latest review uses timestamps instead of server array ordering', () => {
  const early = appendReview({ ...somsak, occurredAt: '2026-11-03T08:12:00+07:00' }, confirmed, '2026-11-04T08:00:00+07:00').reviews[0]
  const late = appendReview(somsak, released).reviews[0]
  assert.equal(displayStatus({ ...somsak, reviews: [late, early] }), 'Released')
})

test('blank note, missing passport confirmation, and clean checks cannot be reviewed', () => {
  assert.throws(() => appendReview(somsak, { ...released, note: '  ' }))
  assert.throws(() => appendReview(somsak, { ...released, passportCompared: false }))
  assert.throws(() => appendReview(somsak, released, '2026-11-04T08:00:00+07:00'))
  const clean: ScreeningRecord = { ...somsak, outcome: 'clear', match: 'None', matchReason: 'none', watchlistEntryId: null }
  assert.throws(() => appendReview(clean, released))
  assert.equal(isPending(clean), false)
  assert.deepEqual(selectQueue([clean], 'Needs review', '', 'Nearest departure'), [])
})

test('nearest departure includes an earlier flagged check before a later held check', () => {
  const earlyFlag = { ...maya, flight: { ...maya.flight, departureAt: '2026-11-05T09:00:00+07:00' } }
  assert.equal(selectQueue([somsak, earlyFlag, arthit], 'Needs review', '', 'Nearest departure')[0].id, maya.id)
})

test('waiting longest uses check timestamps across days; strongest uses match level', () => {
  assert.equal(selectQueue(screeningFixtures, 'Needs review', '', 'Waiting longest')[0].id, maya.id)
  assert.equal(selectQueue(screeningFixtures, 'Needs review', '', 'Strongest match')[0].id, arthit.id)
  assert.equal(selectQueue(screeningFixtures, 'Held', '641', 'Nearest departure')[0].id, somsak.id)
})

test('decided today excludes previous-day reviews and counts latest decisions once per check', () => {
  const yesterday = appendReview(maya, released, '2026-11-04T08:00:00+07:00')
  assert.equal(queueCounts([yesterday])['Decided today'], 0)
  assert.equal(queueCounts([yesterday])['Needs review'], 0)
  assert.equal(selectQueue([yesterday], 'Decided today', '', 'Nearest departure').length, 0)
  const today = appendReview(yesterday, confirmed)
  assert.equal(queueCounts([today])['Decided today'], 1)
  assert.deepEqual(queueCounts(screeningFixtures), { 'Needs review': 3, Held: 2, Flagged: 1, 'Decided today': 5 })
})

test('simulation clock drives relative times and urgency, independent of real date', () => {
  assert.equal(formatDeparture(somsak.flight.departureAt), 'Today 10:40')
  assert.equal(remainingTime(somsak), 'in 2 h 10 m')
  assert.equal(isUrgent(somsak), true)
  assert.equal(isUrgent(arthit), false)
  const departed = { ...somsak, flight: { ...somsak.flight, departureAt: '2026-11-05T08:00:00+07:00' } }
  assert.equal(isUrgent(departed), false)
  assert.equal(remainingTime(departed), 'Departed')
  assert.equal(isUrgent(appendReview(somsak, released)), false)
})

test('trigger-point labels cover booking, check-in, entry changes, and identity corrections', () => {
  assert.equal(sourceLabel('booking'), 'booking')
  assert.equal(sourceLabel('check_in'), 'check-in')
  assert.equal(sourceLabel('new_entry'), 'new entry')
  assert.equal(sourceLabel('entry_change'), 'entry change')
  assert.equal(sourceLabel('identity_change'), 'identity change')
})
