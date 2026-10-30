import { addMonths } from './dates'
import { MemberTier, TierCode, TierRule } from './types'

export const TIER_WINDOW_MONTHS = 12

export interface TierActivity {
  miles: number // earn rows in the window; adjustments never count toward a tier
  occurredAt: Date
  flownBySelf: boolean // the coupon's passenger is the member's own customer.passenger_id
}

export interface TierStats {
  miles: number
  flights: number
}

// Miles count every earn row in the rolling window, the booker's family included. Flights count only coupons the member
// flew themselves, so booking 20 seats on one flight does not reach a flight threshold (review row 18, to be confirmed).
export function tierStats(activity: readonly TierActivity[], now: Date): TierStats {
  const from = addMonths(now, -TIER_WINDOW_MONTHS)
  let miles = 0
  let flights = 0
  for (const row of activity) {
    if (row.occurredAt <= from || row.occurredAt > now) continue
    miles += row.miles
    if (row.flownBySelf) flights += 1
  }
  return { miles, flights }
}

// The best tier the stats reach: miles OR flights.
export function qualifyingTier(stats: TierStats, rules: readonly TierRule[]): TierRule | null {
  let best: TierRule | null = null
  for (const rule of rules) {
    if (stats.miles < rule.minMiles && stats.flights < rule.minFlights) continue
    if (!best || rule.rank > best.rank) best = rule
  }
  return best
}

// The tier in force now. An expired tier is no tier, even before the tier job clears the columns.
export function effectiveTier(member: MemberTier, now: Date): TierCode | null {
  if (!member.tierCode || !member.tierExpiresAt || member.tierExpiresAt <= now) return null
  return member.tierCode
}

// Row 16: reaching a tier at least as high as the current one starts a new validity period; a lower result never cuts
// the current tier short; once the current tier has expired the member falls to what they qualify for now, or no tier.
export function nextMemberTier(member: MemberTier, qualified: TierRule | null, rules: readonly TierRule[], now: Date): MemberTier {
  const current = effectiveTier(member, now)
  const currentRank = current ? (rules.find((r) => r.code === current)?.rank ?? 0) : 0

  if (qualified && qualified.rank >= currentRank) {
    return { tierCode: qualified.code, tierQualifiedAt: now, tierExpiresAt: addMonths(now, qualified.validMonths) }
  }
  if (current) return member
  return { tierCode: null, tierQualifiedAt: null, tierExpiresAt: null }
}

// True when the job should write the member row and send a tier_changed message.
export function tierChanged(before: MemberTier, after: MemberTier): boolean {
  return (
    before.tierCode !== after.tierCode ||
    before.tierQualifiedAt?.getTime() !== after.tierQualifiedAt?.getTime() ||
    before.tierExpiresAt?.getTime() !== after.tierExpiresAt?.getTime()
  )
}

// Progress shown on the dashboard: what is still needed for the next tier up, on either path.
export function progressToNextTier(
  stats: TierStats,
  current: TierCode | null,
  rules: readonly TierRule[],
): { next: TierRule; milesToGo: number; flightsToGo: number } | null {
  const currentRank = current ? (rules.find((r) => r.code === current)?.rank ?? 0) : 0
  const next = [...rules].filter((r) => r.rank > currentRank).sort((a, b) => a.rank - b.rank)[0]
  if (!next) return null
  return { next, milesToGo: Math.max(0, next.minMiles - stats.miles), flightsToGo: Math.max(0, next.minFlights - stats.flights) }
}
