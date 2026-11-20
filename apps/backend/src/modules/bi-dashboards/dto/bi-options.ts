export const PERIOD_GROUPS = ['day', 'week', 'month'] as const
export type PeriodGroup = (typeof PERIOD_GROUPS)[number]

/** `after_refunds` subtracts refunds from revenue, `before_refunds` does not. */
export const REVENUE_MODES = ['after_refunds', 'before_refunds'] as const
export type RevenueMode = (typeof REVENUE_MODES)[number]

/** The four cabins, as the database stores them. */
export const CABIN_KEYS = ['economy', 'premium_economy', 'business', 'first'] as const
export type CabinKey = (typeof CABIN_KEYS)[number]

/** The delay-reason categories, as disruption_reason stores them. */
export const DELAY_CAUSES = ['weather', 'technical', 'crew', 'air_traffic_control', 'security', 'airport_operations', 'other'] as const
export type DelayCause = (typeof DELAY_CAUSES)[number]
