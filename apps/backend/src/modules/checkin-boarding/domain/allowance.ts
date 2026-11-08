import type { BagAllowance } from '../api-types'
import type { PricingProvider, SettingsProvider, TierProvider } from '../providers/providers'

/**
 * The checked allowance of a passenger: feature 4's free kilograms and rate, the bonus of the loyalty tier of
 * feature 11 and the size limit of feature 6. The customer view and the counter share it, so the bags step and the
 * scale always show the same numbers.
 */
export async function bagAllowance(input: {
  pricing: PricingProvider
  tiers: TierProvider
  settings: SettingsProvider
  fareClass: string
  routeId: string
  passengerId: string
}): Promise<BagAllowance> {
  const pricing = await input.pricing.baggage(input.fareClass, input.routeId)
  const tier = await input.tiers.tier(input.passengerId)
  return {
    freeKg: pricing.freeKg,
    tierBonusKg: tier?.bagBonusKg ?? 0,
    ratePerKg: pricing.ratePerKg,
    maxBagKg: pricing.maxBagKg,
    maxLinearCm: await input.settings.checkedBagMaxLinearCm(),
  }
}
