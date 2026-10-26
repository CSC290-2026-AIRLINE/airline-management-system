export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABINS)[number]

export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]

// Closed list, matching the CHECK on pricing_setting.key. The defaults are used only while the seed has not inserted a row.
export const PRICING_SETTING_DEFAULTS = {
  quote_hold_minutes: '15',
  base_currency: 'THB',
} as const
export type PricingSettingKey = keyof typeof PRICING_SETTING_DEFAULTS
export const MAX_QUOTE_HOLD_MINUTES = 1440

// fare_class columns served by /staff/fare-classes/:id/rule (the old fare_rule table, merged into fare_class)
export const FARE_RULE_FIELDS = [
  'min_advance_purchase_days',
  'refundable',
  'changeable',
  'cancel_fee_flat',
  'cancel_fee_pct',
  'change_fee_flat',
  'change_fee_pct',
] as const
