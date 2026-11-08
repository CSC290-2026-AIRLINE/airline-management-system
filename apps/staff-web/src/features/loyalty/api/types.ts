// Shapes of the planned Feature 11 staff API. The mock returns the same shapes, so the pages do not change when the
// HTTP client replaces it. Every route behind these needs the loyalty-admin role on the backend.

export type TierCode = 'silver' | 'gold' | 'platinum'

export type TransactionType = 'earn' | 'redeem' | 'redeem_reversal' | 'expire' | 'adjust'

export interface TierRule {
  code: TierCode
  name: string
  rank: number
  minMiles: number
  minFlights: number
  validMonths: number
}

export type TierRulePatch = Pick<TierRule, 'minMiles' | 'minFlights' | 'validMonths'>

export type Insurance = { kind: 'none' } | { kind: 'included' } | { kind: 'member_price'; priceThb: number }

// What a tier gives; features 6 (baggage) and 12 (lounge, insurance) read these. Upgrades go to higher tiers first.
export interface TierBenefits {
  loungeGuests: number | null // null = no lounge access, 0 = member only
  bonusBaggageKg: number
  priorityCheckIn: boolean
  priorityBoarding: boolean
  complimentaryUpgrade: boolean
  insurance: Insurance
}

// One row per feature 4 fare class. Miles = distance (km) × multiplier, rounded; "0.00" earns nothing.
export interface EarnRuleRow {
  fareClassId: string
  fareClassName: string
  fareClassCode: string
  multiplier: string
}

export interface LoyaltySettings {
  milesRetentionMonths: number
  expiryReminderDays: number
  awardCutoffHours: number
}

export interface LoyaltyRules {
  tiers: TierRule[]
  benefits: Record<TierCode, TierBenefits>
  earnRules: EarnRuleRow[]
  settings: LoyaltySettings
}

export type CabinCode = 'economy' | 'premium_economy' | 'business' | 'first'

export type FlightStatus = 'scheduled' | 'delayed' | 'cancelled' | 'departed'

export interface CabinRelease {
  released: number
  redeemed: number
  milesCost: number
}

// A feature 2 flight with its award seats per cabin (feature 3b's seat inventory, Feature 11's miles price).
export interface AwardFlight {
  flightId: string
  flightNumber: string
  route: string
  departsAt: string
  status: FlightStatus
  aircraft: { name: string; cabins: CabinCode[] }
  releases: Partial<Record<CabinCode, CabinRelease>>
  returnedToCash: boolean // the cutoff passed: unredeemed seats went back to cash sale and the release is locked
}

export interface MemberListItem {
  id: string
  memberNumber: string
  name: string
  email: string
  milesBalance: number
  tier: { code: TierCode; name: string } | null
}

export interface StaffLedgerRow {
  seq: number
  type: TransactionType
  miles: number
  balanceAfter: number
  occurredAt: string
  title: string
  detail: string
}

export interface MemberDetail extends MemberListItem {
  customerId: string
  joinedAt: string
  tierExpiresAt: string | null
  ledger: StaffLedgerRow[] // newest first
}

export type LoungeResult =
  | { outcome: 'admitted'; member: LoungeMember; flightNumber: string; guests: number }
  | { outcome: 'refused'; reason: 'too_many_guests' | 'no_ticket' | 'no_tier' | 'already_visited'; member: LoungeMember }

export interface LoungeMember {
  name: string
  memberNumber: string
  tierName: string | null
  guestsAllowed: number | null // null = no lounge access
  ticket: string | null // e.g. "FY 308 · BKK → NRT · departs 09:10 · checked in"; null = none within 4 hours
}

export interface LoungeVisit {
  id: string
  time: string
  memberName: string
  tierName: string
  flightNumber: string
  guests: number
}

export interface StaffLoyaltyApi {
  getRules(): Promise<LoyaltyRules>
  updateTier(code: TierCode, patch: TierRulePatch): Promise<TierRule>
  updateTierBenefits(code: TierCode, benefits: TierBenefits): Promise<TierBenefits>
  setEarnMultiplier(fareClassId: string, multiplier: string): Promise<EarnRuleRow>
  updateSettings(settings: LoyaltySettings): Promise<LoyaltySettings>
  getAwardFlights(): Promise<AwardFlight[]>
  saveRelease(flightId: string, cabin: CabinCode, released: number, milesCost: number): Promise<AwardFlight>
  searchMembers(query: string): Promise<MemberListItem[]>
  getMember(id: string): Promise<MemberDetail>
  adjustMiles(id: string, miles: number, reason: string): Promise<MemberDetail>
  checkInLounge(query: string, guests: number): Promise<LoungeResult>
  getLoungeVisits(): Promise<LoungeVisit[]>
}
