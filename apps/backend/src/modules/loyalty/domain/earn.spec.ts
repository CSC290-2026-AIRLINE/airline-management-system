import { draftEarn, earnMiles, EarnCandidate } from './earn'
import { EarnRule } from './types'

describe('earnMiles', () => {
  it('rounds half up in integers, as PostgreSQL round() does', () => {
    expect(earnMiles(30, '1.15')).toBe(35) // 34.5; 30 * 1.15 in floating point is 34.4999...
    expect(earnMiles(580, '1.00')).toBe(580)
    expect(earnMiles(580, '1.5')).toBe(870)
    expect(earnMiles(333, '0.25')).toBe(83) // 83.25
    expect(earnMiles(1000, '0')).toBe(0)
  })

  it('refuses a bad multiplier or distance', () => {
    expect(() => earnMiles(100, '-1')).toThrow(RangeError)
    expect(() => earnMiles(100, '1.234')).toThrow(RangeError)
    expect(() => earnMiles(0, '1')).toThrow(RangeError)
    expect(() => earnMiles(10.5, '1')).toThrow(RangeError)
  })
})

describe('draftEarn', () => {
  const joinedAt = new Date('2026-01-01T00:00:00Z')
  const now = new Date('2026-10-30T00:00:00Z')
  const rules = new Map<string, EarnRule>([
    ['fc-y', { fareClassId: 'fc-y', multiplier: '1.00' }],
    ['fc-promo', { fareClassId: 'fc-promo', multiplier: '0.00' }],
  ])
  const base: EarnCandidate = {
    bookingCouponId: 'c1',
    fareClassId: 'fc-y',
    distanceKm: 580,
    isLapInfant: false,
    boarded: true,
    flightCancelled: false,
    arrAt: new Date('2026-10-29T10:00:00Z'),
  }

  it('builds an earn row with the copied rule and the arrival as occurred_at', () => {
    expect(draftEarn(base, rules, joinedAt, now)).toEqual({
      draft: { bookingCouponId: 'c1', miles: 580, distanceKm: 580, fareClassId: 'fc-y', multiplier: '1.00', occurredAt: base.arrAt },
    })
  })

  it.each<[Partial<EarnCandidate>, string]>([
    [{ arrAt: new Date('2026-10-31T00:00:00Z') }, 'not_arrived'],
    [{ flightCancelled: true }, 'cancelled'],
    [{ boarded: false }, 'not_boarded'],
    [{ isLapInfant: true }, 'lap_infant'],
    [{ fareClassId: null }, 'award_seat'],
    [{ arrAt: new Date('2025-12-31T23:59:00Z') }, 'before_joined'],
    [{ fareClassId: 'fc-promo' }, 'no_miles'],
    [{ fareClassId: 'fc-unknown' }, 'no_miles'],
  ])('skips %o as %s', (change, reason) => {
    expect(draftEarn({ ...base, ...change }, rules, joinedAt, now)).toEqual({ skip: reason })
  })
})
