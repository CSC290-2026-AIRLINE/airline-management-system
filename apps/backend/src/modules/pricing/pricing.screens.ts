import type { SelfRegisterScreen } from '../admin-console/dto/admin-console.types'

/**
 * Screens Feature 4 registers with the admin console on boot, one per staff-web page under `/pricing/*`. They are
 * `assignable`, so they show up as tickable rows under "F4 PRICING & FARE RULES" in Role access.
 */
export const F04_SCREENS: SelfRegisterScreen[] = [
  { code: 'f04.fare_setup', name: 'Fare Setup', kind: 'assignable', feature_no: '4' },
  { code: 'f04.pricing_rules', name: 'Pricing Rules', kind: 'assignable', feature_no: '4' },
  { code: 'f04.taxes_promos', name: 'Taxes, Currency & Promos', kind: 'assignable', feature_no: '4' },
  { code: 'f04.expenses_payments', name: 'Expenses & Payments', kind: 'assignable', feature_no: '4' },
  { code: 'f04.monthly_report', name: 'Monthly Report', kind: 'assignable', feature_no: '4' },
]
