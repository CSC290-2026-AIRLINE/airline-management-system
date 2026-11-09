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

/** `POST /staff/loyalty/jobs/:name/run`: what one job run did at the simulated time `ranAt`. */
export interface JobRunResultDto {
  job: string
  ranAt: string
  counts: Record<string, number>
}

/** One cabin's award seats on the Award Release page: `released` is award_limit, `redeemed` the award seats held or sold. */
export interface CabinReleaseDto {
  released: number
  redeemed: number
  milesCost: number
}

/** `GET /staff/loyalty/awards`: a flight with its award seats per cabin. */
export interface AwardFlightDto {
  flightId: string
  flightNumber: string
  route: string
  departsAt: string
  status: 'scheduled' | 'delayed' | 'cancelled' | 'departed'
  aircraft: { name: string; cabins: string[] }
  releases: Record<string, CabinReleaseDto>
  /** The cutoff passed on a flight still for sale: unredeemed seats went back to cash and the release is locked. */
  returnedToCash: boolean
}

/** `awardAvailability` (feature 3a): the miles price and award seats left for one flight and cabin. */
export interface AwardAvailabilityDto {
  flightId: string
  cabin: string
  milesCost: number
  seatsLeft: number
  seatsNeeded: number
  milesTotal: number
  open: boolean
  available: boolean
  /** The customer's balance, or null when no customer is given or they have not joined. */
  balance: number | null
  balanceCovers: boolean | null
}

/** `redeem(bookingId)` (feature 3b): the redeem rows written, one per award coupon. */
export interface RedeemResultDto {
  memberId: string
  milesSpent: number
  redeemed: { bookingCouponId: string; miles: number }[]
  /** Coupons that already had a redeem row (a repeated call); nothing was written for them. */
  alreadyRedeemed: number
}

/** `reverseRedemption(couponIds)` (feature 3b): the miles given back. */
export interface ReversalResultDto {
  reversed: number
  milesReturned: number
  /** Coupons skipped because they are still held or confirmed, or have no redeem row. */
  skippedCouponIds: string[]
}
