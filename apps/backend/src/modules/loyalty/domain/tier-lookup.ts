import { effectiveTier } from './tier'
import { MemberTier, TierCode, TierRule } from './types'

export interface PassengerTier {
  code: TierCode
  name: string
  bonusBaggageKg: number
}

export interface TierLookupSources {
  // customer.passenger_id -> customer.id, for a passenger who is also a customer
  customerIdForPassenger(passengerId: string): string | null
  memberForCustomer(customerId: string): MemberTier | null
}

// Row 19: benefits follow the person who flies, never the booker. Passenger -> their own customer -> member -> tier.
// An unknown passenger, no membership or an expired tier is no tier. Features 6 and 12 call tierForPassenger in process.
export function tierForPassenger(
  passengerId: string,
  sources: TierLookupSources,
  rules: readonly TierRule[],
  now: Date,
): PassengerTier | null {
  const customerId = sources.customerIdForPassenger(passengerId)
  if (!customerId) return null
  const member = sources.memberForCustomer(customerId)
  if (!member) return null
  const code = effectiveTier(member, now)
  const rule = code ? rules.find((r) => r.code === code) : undefined
  return rule ? { code: rule.code, name: rule.name, bonusBaggageKg: rule.bonusBaggageKg } : null
}
