export const CABINS = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABINS)[number]

export const SEAT_TYPES = ['normal', 'exit_row', 'extra_legroom'] as const
export type SeatType = (typeof SEAT_TYPES)[number]
