import { draftAdjustment, earnExpiresAt } from './adjustment'
import { addMonths } from './dates'

const now = new Date('2026-10-30T00:00:00Z')

describe('draftAdjustment', () => {
  const base = { miles: 500, reason: '  Goodwill for delay  ', balance: 1000, now, retentionMonths: 36 }

  it('trims the reason and gives a positive adjustment an expiry', () => {
    expect(draftAdjustment(base)).toEqual({
      draft: { miles: 500, reason: 'Goodwill for delay', expiresAt: new Date('2029-10-30T00:00:00Z') },
    })
  })

  it('gives a negative adjustment no expiry', () => {
    expect(draftAdjustment({ ...base, miles: -1000 })).toEqual({ draft: { miles: -1000, reason: 'Goodwill for delay', expiresAt: null } })
  })

  it.each<[Partial<typeof base>, string]>([
    [{ miles: 0 }, 'zero_miles'],
    [{ miles: 1.5 }, 'not_integer'],
    [{ reason: '   ' }, 'blank_reason'],
    [{ miles: -1001 }, 'below_zero'],
  ])('refuses %o as %s', (change, refusal) => {
    expect(draftAdjustment({ ...base, ...change })).toEqual({ refusal })
  })
})

describe('dates', () => {
  it('counts retention from the flight and clamps month ends', () => {
    expect(earnExpiresAt(new Date('2026-01-31T08:00:00Z'), 36)).toEqual(new Date('2029-01-31T08:00:00Z'))
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1)).toEqual(new Date('2026-02-28T00:00:00Z'))
    expect(addMonths(new Date('2028-02-29T00:00:00Z'), -12)).toEqual(new Date('2027-02-28T00:00:00Z'))
  })
})
