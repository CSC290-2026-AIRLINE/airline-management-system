import { awardLimitOnReturnToCash, awardOpen, awardSeatsLeft, draftRedemption, draftReversals } from './redemption'
import { LedgerRow } from './types'

const now = new Date('2026-10-30T00:00:00Z')
const depAt = new Date('2026-11-10T00:00:00Z')
const seats = { awardLimit: 5, awardHeld: 1, awardSold: 2 }

describe('award seats', () => {
  it('counts seats left and closes at the cutoff', () => {
    expect(awardSeatsLeft(seats)).toBe(2)
    expect(awardSeatsLeft({ awardLimit: 2, awardHeld: 2, awardSold: 1 })).toBe(0)
    expect(awardOpen(depAt, new Date('2026-11-06T23:59:00Z'), 72)).toBe(true)
    expect(awardOpen(depAt, new Date('2026-11-07T00:00:00Z'), 72)).toBe(false)
  })

  it('lowers award_limit to the seats in use on return to cash', () => {
    expect(awardLimitOnReturnToCash(seats)).toBe(3)
  })
})

describe('draftRedemption', () => {
  const input = {
    passengers: [
      { bookingCouponId: 'c1', isLapInfant: false },
      { bookingCouponId: 'c2', isLapInfant: false },
      { bookingCouponId: 'c3', isLapInfant: true },
    ],
    milesCost: 8000,
    seats,
    balance: 20000,
    depAt,
    now,
    cutoffHours: 72,
  }

  it('writes one redeem row per seated passenger; a lap infant costs nothing', () => {
    expect(draftRedemption(input)).toEqual({
      rows: [
        { bookingCouponId: 'c1', miles: -8000 },
        { bookingCouponId: 'c2', miles: -8000 },
      ],
      totalMiles: 16000,
    })
  })

  it.each<[Partial<typeof input>, string]>([
    [{ now: new Date('2026-11-08T00:00:00Z') }, 'past_cutoff'],
    [{ seats: { awardLimit: 3, awardHeld: 1, awardSold: 1 } }, 'not_enough_seats'],
    [{ balance: 15999 }, 'not_enough_miles'],
    [{ passengers: [{ bookingCouponId: 'c3', isLapInfant: true }] }, 'no_seat_passengers'],
  ])('refuses %o as %s', (change, refusal) => {
    expect(draftRedemption({ ...input, ...change })).toEqual({ refusal })
  })
})

describe('draftReversals', () => {
  const r = (id: string, type: LedgerRow['type'], miles: number, reversedTransactionId: string | null = null): LedgerRow => ({
    id,
    type,
    miles,
    occurredAt: now,
    expiresAt: null,
    expiredTransactionId: null,
    reversedTransactionId,
  })

  it('gives back each redeem row once and ignores anything else', () => {
    const ledger = [r('r1', 'redeem', -8000), r('r2', 'redeem', -8000), r('rr1', 'redeem_reversal', 8000, 'r1'), r('e1', 'earn', 500)]
    expect(draftReversals(ledger, ['r1', 'r2', 'e1', 'missing'])).toEqual([{ reversedTransactionId: 'r2', miles: 8000 }])
  })
})
