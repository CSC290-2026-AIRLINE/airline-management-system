// Plain shapes of the Feature 11 tables (migration 20261106120400_feature11_loyalty). The domain functions take plain
// values so they can be tested without a database; the loyalty services map Prisma rows onto these.

export type TierCode = 'silver' | 'gold' | 'platinum'

export type TransactionType = 'earn' | 'redeem' | 'redeem_reversal' | 'expire' | 'adjust'

export interface TierRule {
  code: TierCode
  name: string
  rank: number // higher = better tier
  minMiles: number
  minFlights: number
  validMonths: number
}

export interface EarnRule {
  fareClassId: string
  multiplier: string // NUMERIC(4, 2) as text, so no float ever reaches the miles sum
}

export interface MemberTier {
  tierCode: TierCode | null
  tierQualifiedAt: Date | null
  tierExpiresAt: Date | null
}

export interface LedgerRow {
  id: string
  type: TransactionType
  miles: number
  occurredAt: Date
  expiresAt: Date | null
  expiredTransactionId: string | null
  reversedTransactionId: string | null
}

export interface LoyaltySettings {
  milesRetentionMonths: number
  expiryReminderDays: number
  awardCutoffHours: number
}

export const DEFAULT_SETTINGS: LoyaltySettings = {
  milesRetentionMonths: 36,
  expiryReminderDays: 30,
  awardCutoffHours: 72,
}

// loyalty_tier_benefit.insurance_price: NULL = not offered, 0 = included, above 0 = the member price (base currency).
export type Insurance = { kind: 'none' } | { kind: 'included' } | { kind: 'member_price'; priceThb: number }

// One loyalty_tier_benefit row. Features 6 and 12 read these through tierForPassenger.
export interface TierBenefits {
  loungeGuests: number | null // NULL = no lounge access, 0 = member only
  extraBaggageKg: number
  priorityCheckIn: boolean
  priorityBoarding: boolean
  upgradeEligible: boolean
  insurance: Insurance
}

export const SETTING_KEYS = ['miles_retention_months', 'expiry_reminder_days', 'award_cutoff_hours'] as const
export type SettingKey = (typeof SETTING_KEYS)[number]
