import { effectiveTier, nextMemberTier, progressToNextTier, qualifyingTier, tierChanged, tierStats } from './tier'
import { MemberTier, TierRule } from './types'

const rules: TierRule[] = [
  { code: 'silver', name: 'Silver', rank: 1, minMiles: 15000, minFlights: 20, validMonths: 12, bonusBaggageKg: 5 },
  { code: 'gold', name: 'Gold', rank: 2, minMiles: 40000, minFlights: 50, validMonths: 12, bonusBaggageKg: 10 },
  { code: 'platinum', name: 'Platinum', rank: 3, minMiles: 80000, minFlights: 100, validMonths: 12, bonusBaggageKg: 15 },
]
const byCode = (code: string) => rules.find((r) => r.code === code) as TierRule
const now = new Date('2026-10-30T00:00:00Z')
const none: MemberTier = { tierCode: null, tierQualifiedAt: null, tierExpiresAt: null }

describe('tierStats', () => {
  it('counts the rolling 12 months, and flights only when the member flew', () => {
    const stats = tierStats(
      [
        { miles: 1000, occurredAt: new Date('2026-10-01T00:00:00Z'), flownBySelf: true },
        { miles: 1000, occurredAt: new Date('2026-10-01T00:00:00Z'), flownBySelf: false },
        { miles: 5000, occurredAt: new Date('2025-10-30T00:00:00Z'), flownBySelf: true }, // just outside
        { miles: 5000, occurredAt: new Date('2026-11-01T00:00:00Z'), flownBySelf: true }, // future
      ],
      now,
    )
    expect(stats).toEqual({ miles: 2000, flights: 1 })
  })

  it('does not reach Silver by booking 20 seats on one flight', () => {
    const party = Array.from({ length: 20 }, (_, i) => ({ miles: 500, occurredAt: now, flownBySelf: i === 0 }))
    expect(qualifyingTier(tierStats(party, now), rules)).toBeNull()
  })
})

describe('qualifyingTier', () => {
  it('qualifies on miles OR flights and picks the highest', () => {
    expect(qualifyingTier({ miles: 0, flights: 0 }, rules)).toBeNull()
    expect(qualifyingTier({ miles: 15000, flights: 0 }, rules)?.code).toBe('silver')
    expect(qualifyingTier({ miles: 0, flights: 50 }, rules)?.code).toBe('gold')
    expect(qualifyingTier({ miles: 90000, flights: 3 }, rules)?.code).toBe('platinum')
  })
})

describe('nextMemberTier', () => {
  const gold: MemberTier = {
    tierCode: 'gold',
    tierQualifiedAt: new Date('2026-03-01T00:00:00Z'),
    tierExpiresAt: new Date('2027-03-01T00:00:00Z'),
  }

  it('starts a validity period on first qualification', () => {
    expect(nextMemberTier(none, byCode('silver'), rules, now)).toEqual({
      tierCode: 'silver',
      tierQualifiedAt: now,
      tierExpiresAt: new Date('2027-10-30T00:00:00Z'),
    })
  })

  it('renews on the same tier and upgrades on a higher one', () => {
    expect(nextMemberTier(gold, byCode('gold'), rules, now).tierExpiresAt).toEqual(new Date('2027-10-30T00:00:00Z'))
    expect(nextMemberTier(gold, byCode('platinum'), rules, now).tierCode).toBe('platinum')
  })

  it('never cuts a valid tier short on a lower result', () => {
    expect(nextMemberTier(gold, byCode('silver'), rules, now)).toBe(gold)
    expect(nextMemberTier(gold, null, rules, now)).toBe(gold)
  })

  it('falls to what the member qualifies for once the tier has expired', () => {
    const later = new Date('2027-03-01T00:00:00Z')
    expect(nextMemberTier(gold, byCode('silver'), rules, later).tierCode).toBe('silver')
    expect(nextMemberTier(gold, null, rules, later)).toEqual(none)
  })

  it('reports a change only when a column moves', () => {
    expect(tierChanged(gold, nextMemberTier(gold, null, rules, now))).toBe(false)
    expect(tierChanged(none, nextMemberTier(none, null, rules, now))).toBe(false)
    expect(tierChanged(gold, nextMemberTier(gold, byCode('gold'), rules, now))).toBe(true)
  })
})

describe('effectiveTier', () => {
  it('treats an expired tier as no tier', () => {
    const member: MemberTier = { tierCode: 'gold', tierQualifiedAt: new Date('2025-10-01T00:00:00Z'), tierExpiresAt: now }
    expect(effectiveTier(member, new Date('2026-10-29T23:59:59Z'))).toBe('gold')
    expect(effectiveTier(member, now)).toBeNull()
    expect(effectiveTier(none, now)).toBeNull()
  })
})

describe('progressToNextTier', () => {
  it('shows what is left on both paths, and nothing above the top tier', () => {
    expect(progressToNextTier({ miles: 10000, flights: 4 }, null, rules)).toMatchObject({
      next: { code: 'silver' },
      milesToGo: 5000,
      flightsToGo: 16,
    })
    expect(progressToNextTier({ miles: 50000, flights: 4 }, 'silver', rules)).toMatchObject({ next: { code: 'gold' }, milesToGo: 0 })
    expect(progressToNextTier({ miles: 0, flights: 0 }, 'platinum', rules)).toBeNull()
  })
})
