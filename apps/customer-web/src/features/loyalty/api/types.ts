// Response shapes of the planned Feature 11 customer API (GET /api/loyalty/...). The mock returns the same shapes, so the
// pages do not change when the HTTP client replaces it.

export type TierCode = 'silver' | 'gold' | 'platinum'

export type TransactionType = 'earn' | 'redeem' | 'redeem_reversal' | 'expire' | 'adjust'

export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'

export type Insurance = { kind: 'none' } | { kind: 'included' } | { kind: 'member_price'; priceThb: number }

// What a tier gives. Upgrade order is not stored: higher tiers are upgraded first.
export interface TierBenefits {
  loungeGuests: number | null // null = no lounge access, 0 = member only
  bonusBaggageKg: number
  priorityCheckIn: boolean
  priorityBoarding: boolean
  complimentaryUpgrade: boolean
  insurance: Insurance
}

export interface TierInfo {
  code: TierCode
  name: string
  rank: number
  minMiles: number
  minFlights: number
  validMonths: number
  benefits: TierBenefits
}

export interface MemberSummary {
  memberNumber: string
  name: string
  joinedAt: string
  milesBalance: number
  tier: { code: TierCode; name: string; expiresAt: string } | null
  last12Months: { miles: number; flights: number }
  nextTier: { code: TierCode; name: string; minMiles: number; minFlights: number; milesToGo: number; flightsToGo: number } | null
  expiringSoon: { expiresOn: string; miles: number }[]
}

export interface StatementRow {
  seq: number
  type: TransactionType
  miles: number
  balanceAfter: number
  occurredAt: string
  title: string // e.g. "BKK → NRT · FY 308 · your seat"
  detail: string // e.g. "Discount × 0.50 · 4,600 km"
  expiryNote: string | null // e.g. "Expires 12 Oct 2029", "5,800 left · expire 6 Nov 2026"
}

export interface RedemptionRow {
  transactionId: string
  route: string
  flightNumber: string
  departsAt: string
  cabin: string
  seats: number
  miles: number // positive: what the seats cost
  bookingStatus: BookingStatus // read from feature 3
  bookedAt: string
  bookingReference: string | null // null when the hold ended before payment
  returned: boolean // a redeem_reversal gave the miles back
}

export type BenefitKind = 'lounge' | 'insurance' | 'upgrade'

export interface BenefitUse {
  id: string
  kind: BenefitKind
  route: string
  flightNumber: string
  usedAt: string
  detail: string
}

export interface LoyaltyApi {
  getTiers(): Promise<TierInfo[]>
  getMember(): Promise<MemberSummary | null> // null = not a member yet
  join(name: string): Promise<MemberSummary>
  getStatement(): Promise<StatementRow[]> // newest first
  getRedemptions(): Promise<RedemptionRow[]>
  getBenefitUses(): Promise<BenefitUse[]>
}
