// Kept out of FareSetupPage.tsx so the route file can validate ?tab= without importing a component module's constants.
export const FARE_SETUP_TABS = ['fare-classes', 'base-fares'] as const
export type FareSetupTab = (typeof FARE_SETUP_TABS)[number]

export function isFareSetupTab(value: unknown): value is FareSetupTab {
  return (FARE_SETUP_TABS as readonly unknown[]).includes(value)
}
