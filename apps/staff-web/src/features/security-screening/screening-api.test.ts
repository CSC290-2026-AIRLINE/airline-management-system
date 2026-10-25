import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { mapDetail, mapQueueItem, postReview, ScreeningApiError, screeningRequest } from './screening-api.ts'
import type { ApiDetail, ApiReview, AuthFetch } from './screening-api.ts'
import { latestReview, isUrgent } from './screening-model.ts'

const review: ApiReview = {
  id: 'review-1',
  revision: 1,
  decision: 'false_positive',
  note: 'Compared passport',
  by: 'Security reviewer',
  reviewedAt: '2026-10-25T01:00:00Z',
  passportCompared: null,
  authorityNotifiedAt: null,
  notificationMode: null,
}
const identity = {
  firstName: 'MAYA',
  lastName: 'KORNSIRI',
  dateOfBirth: '1991-04-30',
  nationality: 'mm',
  gender: 'F',
  passportNumber: 'AB1237712',
  passportLast4: '7712',
}
const detail: ApiDetail = {
  id: '40000000-0000-4000-8000-000000000001',
  runId: 'run',
  passengerId: 'passenger',
  watchlistEntryId: 'entry',
  name: 'MAYA KORNSIRI',
  triggerPoint: 'check_in',
  outcome: 'held',
  match: 'probable',
  matchReason: 'name_and_dob',
  occurredAt: '2026-10-25T00:00:00Z',
  similarity: 0.75,
  flight: { id: 'flight', label: 'FD 641 · BKK → NRT', departureAt: '2026-10-25T04:00:00Z', status: 'scheduled' },
  latestReview: review,
  now: '2026-10-25T01:00:00Z',
  snapshot: { passenger: identity, entry: { ...identity, passportNumber: 'CD9997712' } },
  watchlist: {
    listType: 'wanted',
    issuingAuthority: 'Example authority',
    reason: null,
    listedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    source: 'current_metadata',
  },
  booking: { source: 'not_connected', reference: null, bookedBy: null, others: null },
  reviews: [review],
  history: [],
}

test('detail mapping masks passport and does not confuse matching last-four digits with matching passports', () => {
  const mapped = mapDetail(detail)
  assert.equal(mapped.comparison[3][1], '•••• 7712')
  assert.equal(mapped.comparison[3][2], '•••• 7712')
  assert.equal(mapped.comparisonMatches?.[3], false)
  assert.ok(!JSON.stringify(mapped).includes('AB1237712'))
  assert.ok(!JSON.stringify(mapped).includes('CD9997712'))
  assert.equal(mapped.authority, 'Example authority')
  assert.equal(mapped.bookedBy, 'Not connected')
  assert.equal(mapped.reviews[0].passportCompared, null)
})

test('API revisions win over array order and simulated timestamps', () => {
  const record = mapDetail({ ...detail, reviews: [{ ...review, revision: 3, reviewedAt: '2026-10-24T00:00:00Z' }, review] })
  assert.equal(latestReview(record)?.revision, 3)
})

test('queue urgency uses the server clock and queue summaries never invent detail data', () => {
  const record = mapQueueItem({ ...detail, latestReview: null }, detail.now)
  assert.equal(isUrgent(record), true)
  assert.equal(record.comparison.length, 0)
  assert.equal(record.similarity, '0.75')
})

test('saving sends the highest revision, trimmed note and the original check ID through the supplied auth fetch', async () => {
  let called = 0
  const fetch: AuthFetch = async (path, init) => {
    called++
    assert.equal(path, `/api/security/screenings/${detail.id}/reviews`)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(JSON.parse(String(init?.body)), {
      decision: 'confirmed',
      note: 'Compared passport',
      passportCompared: true,
      expectedRevision: 3,
    })
    return Response.json({ review: { ...review, revision: 4 }, clearance: 'denied' })
  }
  const record = mapDetail({ ...detail, reviews: [review, { ...review, revision: 3 }] })
  await postReview(fetch, record, { decision: 'confirmed', note: ' Compared passport ', passportCompared: true })
  assert.equal(called, 1)
})

test('first review sends revision zero and rejects invalid input before making a request', async () => {
  const record = mapDetail({ ...detail, reviews: [], latestReview: null })
  let called = 0
  const fetch: AuthFetch = async (_path, init) => {
    called++
    assert.equal(JSON.parse(String(init?.body)).expectedRevision, 0)
    return Response.json({})
  }
  const draft = { decision: 'false_positive' as const, note: 'Compared passport', passportCompared: true }
  assert.throws(() => postReview(fetch, record, { ...draft, passportCompared: false }))
  assert.throws(() => postReview(fetch, record, { ...draft, note: ' ' }))
  assert.throws(() => postReview(fetch, { ...record, outcome: 'clear' }, draft))
  assert.equal(called, 0)
  await postReview(fetch, record, draft)
  assert.equal(called, 1)
})

for (const [status, message] of [
  [401, 'session'],
  [403, 'security role'],
  [404, 'not found'],
  [409, 'reload'],
  [503, 'unavailable'],
] as const) {
  test(`HTTP ${status} is not treated as a saved decision and is never automatically retried`, async () => {
    let called = 0
    const fetch: AuthFetch = async () => {
      called++
      return Response.json({}, { status })
    }
    await assert.rejects(
      screeningRequest(fetch, '/api/security/screenings'),
      (error) => error instanceof ScreeningApiError && error.status === status && error.message.includes(message),
    )
    assert.equal(called, 1)
  })
}

test('earlier checks retain their original review notes without duplicating selected-check reviews', () => {
  const mapped = mapDetail({
    ...detail,
    history: [
      { id: 'earlier', triggerPoint: 'booking', match: 'weak', outcome: 'flagged', occurredAt: detail.occurredAt, reviews: [review] },
      {
        id: detail.id,
        triggerPoint: detail.triggerPoint,
        match: detail.match,
        outcome: detail.outcome,
        occurredAt: detail.occurredAt,
        reviews: [review],
      },
    ],
  })
  assert.equal(mapped.history.length, 3)
  assert.equal(mapped.historyReviews?.[1]?.note, review.note)
  assert.equal(mapped.reviews.length, 1)
})
