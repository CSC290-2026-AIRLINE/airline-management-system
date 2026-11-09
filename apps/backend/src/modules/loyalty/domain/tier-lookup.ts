import { effectiveTier } from './tier'
import { MemberTier, TierBenefits, TierCode, TierRule } from './types'

// What features 6 and 12 get back. tierCode null = no tier, so no benefits.
export type PassengerTier = { tierCode: TierCode; name: string; expiresAt: Date; benefits: TierBenefits } | { tierCode: null }

export const NO_TIER: PassengerTier = { tierCode: null }

export interface TierLookupSources {
  // customer.passenger_id -> customer.id, for a passenger who is also a customer
  customerIdForPassenger(passengerId: string): string | null
  memberForCustomer(customerId: string): MemberTier | null
}

// Benefits follow the person who flies, never the booker: passenger -> their own customer -> member -> tier.
// An unknown passenger, no membership, an expired tier or a tier without a benefits row is no tier.
export function tierForPassenger(
  passengerId: string,
  sources: TierLookupSources,
  rules: readonly TierRule[],
  benefits: ReadonlyMap<string, TierBenefits>,
  now: Date,
): PassengerTier {
  const customerId = sources.customerIdForPassenger(passengerId)
  if (!customerId) return NO_TIER
  const member = sources.memberForCustomer(customerId)
  if (!member) return NO_TIER
  const code = effectiveTier(member, now)
  const rule = code ? rules.find((r) => r.code === code) : undefined
  const tierBenefits = code ? benefits.get(code) : undefined
  if (!rule || !tierBenefits || !member.tierExpiresAt) return NO_TIER
  return { tierCode: rule.code, name: rule.name, expiresAt: member.tierExpiresAt, benefits: tierBenefits }
}
