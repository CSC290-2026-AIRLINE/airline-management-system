import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatDateRange } from './format.ts'

describe('formatDateRange', () => {
  it('collapses a span in one month and shows a single day on its own', () => {
    assert.equal(formatDateRange('2026-11-02', '2026-11-06'), '02–06 Nov 2026')
    assert.match(formatDateRange('2026-11-02', '2026-11-02'), /2 Nov 2026/)
  })

  it('shows a dash instead of throwing for an empty or invalid date', () => {
    assert.equal(formatDateRange('', '2026-11-06'), '—')
    assert.equal(formatDateRange('2026-11-02', ''), '—')
    assert.equal(formatDateRange('2026-13-40', '2026-11-06'), '—')
  })
})
