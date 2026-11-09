import { tierForPassenger, TierLookupSources } from './tier-lookup'
import { MemberTier, TierBenefits, TierRule } from './types'

const rules: TierRule[] = [
  { code: 'silver', name: 'Silver', rank: 1, minMiles: 15000, minFlights: 20, validMonths: 12 },
  { code: 'gold', name: 'Gold', rank: 2, minMiles: 40000, minFlights: 50, validMonths: 12 },
]
const goldBenefits: TierBenefits = {
  loungeGuests: 1,
  extraBaggageKg: 10,
  priorityCheckIn: true,
  priorityBoarding: true,
  upgradeEligible: true,
  insurance: { kind: 'included' },
}
const benefits = new Map<string, TierBenefits>([['gold', goldBenefits]])
const now = new Date('2026-10-30T00:00:00Z')
const goldExpiry = new Date('2027-01-01T00:00:00Z')

const members = new Map<string, MemberTier>([
  ['cust-gold', { tierCode: 'gold', tierQualifiedAt: new Date('2026-01-01T00:00:00Z'), tierExpiresAt: goldExpiry }],
  [
    'cust-lapsed',
    { tierCode: 'silver', tierQualifiedAt: new Date('2025-01-01T00:00:00Z'), tierExpiresAt: new Date('2026-01-01T00:00:00Z') },
  ],
  ['cust-silver', { tierCode: 'silver', tierQualifiedAt: new Date('2026-06-01T00:00:00Z'), tierExpiresAt: goldExpiry }],
])
const sources: TierLookupSources = {
  customerIdForPassenger: (p) =>
    ({ 'pax-gold': 'cust-gold', 'pax-lapsed': 'cust-lapsed', 'pax-nonmember': 'cust-none', 'pax-silver': 'cust-silver' })[p] ?? null,
  memberForCustomer: (c) => members.get(c) ?? null,
}

describe('tierForPassenger', () => {
  it('returns the flying passenger’s own tier with its benefits', () => {
    expect(tierForPassenger('pax-gold', sources, rules, benefits, now)).toEqual({
      tierCode: 'gold',
      name: 'Gold',
      expiresAt: goldExpiry,
      benefits: goldBenefits,
    })
  })

  it.each(['pax-family-of-gold', 'pax-nonmember', 'pax-lapsed'])('returns no tier for %s', (passengerId) => {
    expect(tierForPassenger(passengerId, sources, rules, benefits, now)).toEqual({ tierCode: null })
  })

  it('returns no tier when the tier has no benefits row', () => {
    expect(tierForPassenger('pax-silver', sources, rules, benefits, now)).toEqual({ tierCode: null })
  })
})
