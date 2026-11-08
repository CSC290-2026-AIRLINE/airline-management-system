// Shapes of the Feature 11 tables proposed in docs/feature-11-loyalty/schema-proposal.sql. The domain functions take
// plain values so they can be tested without a database; the service maps Prisma rows onto these once the tables exist.

export type TierCode = 'silver' | 'gold' | 'platinum'

export type TransactionType = 'earn' | 'redeem' | 'redeem_reversal' | 'expire' | 'adjust'

export interface TierRule {
  code: TierCode
  name: string
  rank: number // higher = better tier
  minMiles: number
  minFlights: number
  validMonths: number
  bonusBaggageKg: number
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
