import type { StatementLine } from '../domain/ledger-view'
import type { LoyaltySettings, TierBenefits, TierCode, TierRule, TransactionType } from '../domain/types'

// Response shapes of the Feature 11 routes. customer-web's and staff-web's `features/loyalty/api/types.ts` mirror these.

/** `GET /loyalty/tier-benefits`, `GET /staff/loyalty/tier-benefits`: one tier rule with its benefits. */
export interface TierInfoDto extends TierRule {
  benefits: TierBenefits
}

/** `GET /loyalty/members/me`, `POST /loyalty/members`. */
export interface MemberSummaryDto {
  memberNumber: string
  name: string
  email: string
  joinedAt: string
  asOf: string // the simulation clock's now
  milesBalance: number
  tier: { code: TierCode; name: string; qualifiedAt: string; expiresAt: string } | null
  tierMiles: number
  tierFlights: number
  nextTier: { code: TierCode; name: string; minMiles: number; minFlights: number } | null
  expiringSoon: { expiresOn: string; miles: number }[]
}

export type StatementRowDto = StatementLine

export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'

/** `GET /loyalty/redemptions`: the redeem rows of one booking on one flight. */
export interface RedemptionRowDto {
  transactionId: string
  fromCity: string
  toCity: string
  flightNumber: string
  departsAt: string
  cabin: string
  seats: number
  miles: number
  bookingStatus: BookingStatus
  bookingReference: string | null
  returned: boolean
}

/** `GET /loyalty/members/me/benefits`. */
export interface BenefitUseDto {
  id: string
  kind: 'lounge_visit' | 'upgrade' | 'insurance'
  route: string
  usedAt: string
  detail: string
}

/** `GET /staff/loyalty/members`. */
export interface MemberListItemDto {
  id: string
  memberNumber: string
  name: string
  email: string
  milesBalance: number
  tier: { code: TierCode; name: string } | null
}

export interface StaffLedgerRowDto {
  seq: number
  type: TransactionType
  miles: number
  balanceAfter: number
  occurredAt: string
  title: string
  detail: string
}

/** `GET /staff/loyalty/members/:id`, `POST /staff/loyalty/members/:id/adjustments`. */
export interface MemberDetailDto extends MemberListItemDto {
  customerId: string
  joinedAt: string
  tierExpiresAt: string | null
  ledger: StaffLedgerRowDto[]
}

/** `GET /staff/loyalty/earn-rules`: one feature 4 fare class with its multiplier ("0.00" when it has no rule). */
export interface EarnRuleDto {
  fareClassId: string
  fareClassCode: string
  fareClassName: string
  cabin: string
  multiplier: string
}

export type LoyaltySettingsDto = LoyaltySettings
