import { tierForPassenger, TierLookupSources } from './tier-lookup'
import { MemberTier, TierRule } from './types'

const rules: TierRule[] = [
  { code: 'silver', name: 'Silver', rank: 1, minMiles: 15000, minFlights: 20, validMonths: 12, bonusBaggageKg: 5 },
  { code: 'gold', name: 'Gold', rank: 2, minMiles: 40000, minFlights: 50, validMonths: 12, bonusBaggageKg: 10 },
]
const now = new Date('2026-10-30T00:00:00Z')

const members = new Map<string, MemberTier>([
  ['cust-gold', { tierCode: 'gold', tierQualifiedAt: new Date('2026-01-01T00:00:00Z'), tierExpiresAt: new Date('2027-01-01T00:00:00Z') }],
  [
    'cust-lapsed',
    { tierCode: 'silver', tierQualifiedAt: new Date('2025-01-01T00:00:00Z'), tierExpiresAt: new Date('2026-01-01T00:00:00Z') },
  ],
])
const sources: TierLookupSources = {
  customerIdForPassenger: (p) => ({ 'pax-gold': 'cust-gold', 'pax-lapsed': 'cust-lapsed', 'pax-nonmember': 'cust-none' })[p] ?? null,
  memberForCustomer: (c) => members.get(c) ?? null,
}

describe('tierForPassenger', () => {
  it('returns the flying passenger’s own tier with the baggage bonus', () => {
    expect(tierForPassenger('pax-gold', sources, rules, now)).toEqual({ code: 'gold', name: 'Gold', bonusBaggageKg: 10 })
  })

  it.each(['pax-family-of-gold', 'pax-nonmember', 'pax-lapsed'])('returns no tier for %s', (passengerId) => {
    expect(tierForPassenger(passengerId, sources, rules, now)).toBeNull()
  })
})
