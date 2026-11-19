import assert from 'node:assert/strict'
import test from 'node:test'
import { liveCaseNumber } from './live-case.ts'

test('finds the live case for a tag', () => {
  for (const status of ['open', 'matched', 'delivering', 'lost']) {
    assert.equal(
      liveCaseNumber([
        { caseNumber: 'LB-2026-000001', status: 'closed' },
        { caseNumber: 'LB-2026-000002', status },
      ]),
      'LB-2026-000002',
    )
  }
})

test('no live case when every case for the tag is closed or cancelled, or there is none', () => {
  assert.equal(
    liveCaseNumber([
      { caseNumber: 'LB-2026-000001', status: 'closed' },
      { caseNumber: 'LB-2026-000002', status: 'cancelled' },
    ]),
    null,
  )
  assert.equal(liveCaseNumber([]), null)
})
