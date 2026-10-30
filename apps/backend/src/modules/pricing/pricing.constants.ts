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

// Pricing rule groups, in the order applyRules multiplies them onto the base fare.
export const RULE_GROUPS = ['urgency', 'load', 'month', 'period'] as const
export type RuleGroup = (typeof RULE_GROUPS)[number]

// The condition columns each group may fill; a rule must leave every other group's columns empty.
export const RULE_GROUP_FIELDS = {
  urgency: ['min_days_out', 'max_days_out'],
  load: ['min_seats_left_pct', 'max_seats_left_pct'],
  month: ['month'],
  period: ['start_date', 'end_date'],
} as const satisfies Record<RuleGroup, readonly string[]>
export type RuleConditionField = (typeof RULE_GROUP_FIELDS)[RuleGroup][number]

export const PROMO_KINDS = ['promo', 'corporate'] as const
export type PromoKind = (typeof PROMO_KINDS)[number]

// details.reason of a PROMO_INVALID error.
export type PromoInvalidReason = 'unknown' | 'inactive' | 'not_yet_valid' | 'expired' | 'exhausted'

export const TAX_FEE_KINDS = ['tax', 'surcharge', 'fee'] as const
export type TaxFeeKind = (typeof TAX_FEE_KINDS)[number]

export const TAX_FEE_CALC_TYPES = ['flat', 'pct'] as const
export type TaxFeeCalcType = (typeof TAX_FEE_CALC_TYPES)[number]
