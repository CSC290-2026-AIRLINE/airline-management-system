export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABINS)[number]

export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]

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
