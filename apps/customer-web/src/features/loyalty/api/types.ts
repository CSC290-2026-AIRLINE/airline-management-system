// Response shapes of the Feature 11 customer API (/api/loyalty/...). They mirror the backend's
// apps/backend/src/modules/loyalty/dto/responses.ts; change both together.

export type TierCode = 'silver' | 'gold' | 'platinum'

export type TransactionType = 'earn' | 'redeem' | 'redeem_reversal' | 'expire' | 'adjust'

export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'

// loyalty_tier_benefit.insurance_price: null = not offered, 0 = included, above 0 = member price (THB).
export type Insurance = { kind: 'none' } | { kind: 'included' } | { kind: 'member_price'; priceThb: number }

// One loyalty_tier_benefit row. Upgrade order is not stored: higher tiers are upgraded first.
export interface TierBenefits {
  loungeGuests: number | null // null = no lounge access, 0 = member only
  extraBaggageKg: number
  priorityCheckIn: boolean
  priorityBoarding: boolean
  upgradeEligible: boolean
  insurance: Insurance
}

// GET /loyalty/tier-benefits: one loyalty_tier_rule row with its benefits.
export interface TierInfo {
  code: TierCode
  name: string
  rank: number
  minMiles: number
  minFlights: number
  validMonths: number
  benefits: TierBenefits
}

// GET /loyalty/members/me
export interface MemberSummary {
  memberNumber: string
  name: string
  email: string
  joinedAt: string
  asOf: string // the simulation clock's "now", which every date window on these pages is measured from
  milesBalance: number
  tier: { code: TierCode; name: string; qualifiedAt: string; expiresAt: string } | null
  // Tier qualification in the rolling 12 months: only earn rows from seats the member flew personally.
  tierMiles: number
  tierFlights: number
  nextTier: { code: TierCode; name: string; minMiles: number; minFlights: number } | null
  expiringSoon: { expiresOn: string; miles: number }[]
}

// GET /loyalty/members/me/transactions: one ledger row with the balance after it.
export interface StatementRow {
  seq: number
  type: TransactionType
  miles: number
  balanceAfter: number
  occurredAt: string
  title: string // e.g. "BKK → NRT · FY 308 · your seat"
  detail: string // e.g. "Discount × 0.50 · 4,600 km"
  bookedForOther: boolean // an earn on a companion's seat: counts toward the balance, not the tier
  expiryNote: string | null // e.g. "Expires 12 Oct 2029", "5,800 left · expire 6 Nov 2026"
  expiringSoon: boolean
}

// GET /loyalty/redemptions: one redeem row with the booking status read from Feature 3b.
export interface RedemptionRow {
  transactionId: string
  fromCity: string
  toCity: string
  flightNumber: string
  departsAt: string
  cabin: string
  seats: number
  miles: number // positive: what the seats cost
  bookingStatus: BookingStatus
  bookingReference: string | null // null when the hold ended before payment
  returned: boolean // a redeem_reversal gave the miles back
}

export type BenefitUseKind = 'lounge_visit' | 'upgrade' | 'insurance'

// GET /loyalty/members/me/benefits: lounge visits and upgrades (loyalty_benefit_use) and insurance policies.
export interface BenefitUse {
  id: string
  kind: BenefitUseKind
  route: string // e.g. "BKK → NRT · FY 308"
  usedAt: string
  detail: string // e.g. "Member only", "Economy → Business", "Policy FLI-204815 · Included"
}

export interface LoyaltyApi {
  getTiers(): Promise<TierInfo[]>
  getMember(): Promise<MemberSummary | null> // null = not a member yet
  join(): Promise<MemberSummary>
  getStatement(): Promise<StatementRow[]> // newest first
  getRedemptions(): Promise<RedemptionRow[]>
  getBenefitUses(): Promise<BenefitUse[]>
}
