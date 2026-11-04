import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { offerText, STATUS_LABEL, TONE } from './approval-labels.ts'
import type { ApprovalRow } from './types.ts'

// The fs-status-<tone> classes that exist in flight-scheduling.css.
const CSS_TONES = ['active', 'arrived', 'cancelled', 'delayed', 'departed', 'diverted', 'failed', 'holding', 'ok']

const row = (offers: ApprovalRow['offers']) => ({ offers }) as ApprovalRow

describe('approval labels', () => {
  it('gives every status a label and a tone', () => {
    assert.deepEqual(Object.keys(TONE).sort(), Object.keys(STATUS_LABEL).sort())
    assert.equal(Object.keys(STATUS_LABEL).length, 7)
  })

  it('only uses tones that have a style, so no status shows as an unstyled pill', () => {
    for (const [status, tone] of Object.entries(TONE)) assert.ok(CSS_TONES.includes(tone), `${status} uses ${tone}`)
  })

  it('says "Other times offered" for an offer and "Confirmed" for a consumed approval', () => {
    assert.equal(STATUS_LABEL.alternative_offered, 'Other times offered')
    assert.equal(STATUS_LABEL.consumed, 'Confirmed')
  })

  describe('offerText', () => {
    it('lists slots as local clock times, comma separated', () => {
      const offers = [
        {
          kind: 'slot' as const,
          starts_at: '2026-11-10T22:00:00Z',
          ends_at: null,
        },
        {
          kind: 'slot' as const,
          starts_at: '2026-11-10T22:15:00Z',
          ends_at: null,
        },
      ]
      assert.equal(offerText(row(offers), 'Asia/Bangkok'), '05:00, 05:15')
    })

    it('writes a window as "from to to" in local time', () => {
      const offers = [
        {
          kind: 'window' as const,
          starts_at: '2026-11-10T23:00:00Z',
          ends_at: '2026-11-11T02:45:00Z',
        },
      ]
      assert.equal(offerText(row(offers), 'Asia/Bangkok'), '06:00 to 09:45')
    })

    it('uses the zone it is given', () => {
      const offers = [
        {
          kind: 'slot' as const,
          starts_at: '2026-11-10T22:00:00Z',
          ends_at: null,
        },
      ]
      assert.equal(offerText(row(offers), 'UTC'), '22:00')
    })

    it('is empty when nothing was offered', () => {
      assert.equal(offerText(row([]), 'Asia/Bangkok'), '')
    })
  })
})
