import { policyTerms } from './insurance'
import { loungeRefusal, normaliseDeskQuery } from './lounge'
import { freeCashSeats, nextCabin, upgradeQueues, type UpgradeCandidate } from './upgrade'

describe('lounge rules', () => {
  const ok = { loungeGuests: 1, hasTicket: true, guests: 1, alreadyVisited: false }

  it('admits a member within their guest allowance', () => {
    expect(loungeRefusal(ok)).toBeNull()
  })

  it('checks tier, then ticket, then guests, then one visit per flight', () => {
    expect(loungeRefusal({ ...ok, loungeGuests: null, hasTicket: false })).toBe('no_tier')
    expect(loungeRefusal({ ...ok, hasTicket: false, guests: 5 })).toBe('no_ticket')
    expect(loungeRefusal({ ...ok, guests: 2, alreadyVisited: true })).toBe('too_many_guests')
    expect(loungeRefusal({ ...ok, alreadyVisited: true })).toBe('already_visited')
  })

  it('treats 0 guests allowed as member only, not as no access', () => {
    expect(loungeRefusal({ ...ok, loungeGuests: 0, guests: 0 })).toBeNull()
    expect(loungeRefusal({ ...ok, loungeGuests: 0, guests: 1 })).toBe('too_many_guests')
  })

  it('reads FL and 8 digits as a member number and anything else as a booking reference', () => {
    expect(normaliseDeskQuery(' fl10000142 ')).toEqual({ kind: 'member', memberNumber: 'FL10000142' })
    expect(normaliseDeskQuery('fly7k2')).toEqual({ kind: 'booking', reference: 'FLY7K2' })
  })
})

describe('upgrade rules', () => {
  it('steps up to the next cabin the flight has, one step only', () => {
    expect(nextCabin('economy', ['economy', 'business', 'first'])).toBe('business')
    expect(nextCabin('economy', ['economy', 'premium_economy', 'business'])).toBe('premium_economy')
    expect(nextCabin('business', ['economy', 'business'])).toBeNull()
    expect(nextCabin('unknown', ['economy', 'business'])).toBeNull()
  })

  it('never counts sold, held or still-open award seats as free', () => {
    const base = { capacity: 20, heldCount: 3, soldCount: 10, awardLimit: 4, awardHeldCount: 1, awardSoldCount: 1 }
    expect(freeCashSeats(base)).toBe(5) // 20 - 3 - 10 - (4 - 1 - 1)
    expect(freeCashSeats({ ...base, soldCount: 20 })).toBe(0)
  })

  it('queues per flight and cabin, highest tier first, then the earliest confirmed booking', () => {
    const c = (couponId: string, tierRank: number, day: number, fromCabin = 'economy'): UpgradeCandidate => ({
      couponId,
      flightId: 'f1',
      fromCabin,
      tierRank,
      confirmedAt: new Date(Date.UTC(2026, 10, day)),
    })
    const queues = upgradeQueues([c('silver-old', 1, 1), c('gold-new', 2, 5), c('gold-old', 2, 2), c('biz', 3, 1, 'business')])
    expect(queues.get('f1:economy')?.map((q) => q.couponId)).toEqual(['gold-old', 'gold-new', 'silver-old'])
    expect(queues.get('f1:business')?.map((q) => q.couponId)).toEqual(['biz'])
  })
})

describe('insurance terms', () => {
  it('is free when the tier includes it, in the base currency', () => {
    expect(policyTerms({ kind: 'included' }, null, 'THB')).toEqual({ price: 0, currency: 'THB', source: 'included' })
  })

  it('charges what the member paid at checkout', () => {
    expect(policyTerms({ kind: 'member_price', priceThb: 190 }, { amount: 190, currency: 'THB' }, 'THB')).toEqual({
      price: 190,
      currency: 'THB',
      source: 'paid',
    })
  })

  it('issues nothing when cover was neither included nor paid for', () => {
    expect(policyTerms({ kind: 'member_price', priceThb: 190 }, null, 'THB')).toBeNull()
    expect(policyTerms({ kind: 'none' }, null, 'THB')).toBeNull()
    expect(policyTerms(null, { amount: 0, currency: 'THB' }, 'THB')).toBeNull()
  })
})
