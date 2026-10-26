export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABINS)[number]

export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]

export const TAX_FEE_KINDS = ['tax', 'surcharge', 'fee'] as const
export type TaxFeeKind = (typeof TAX_FEE_KINDS)[number]

export const TAX_FEE_CALC_TYPES = ['flat', 'pct'] as const
export type TaxFeeCalcType = (typeof TAX_FEE_CALC_TYPES)[number]
