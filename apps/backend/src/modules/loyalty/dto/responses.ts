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

/** The member found at the lounge desk, with what their tier allows and the ticket that qualifies them. */
export interface LoungeMemberDto {
  name: string
  memberNumber: string
  tierName: string | null
  guestsAllowed: number | null // null = no lounge access
  ticket: string | null // e.g. "FY 308 · BKK → NRT · departs 09:10 · checked in"; null = none within 4 hours
}

/** `POST /staff/loyalty/lounge-visits`. A refusal is an answer, not an error: the desk shows the reason. */
export type LoungeResultDto =
  | { outcome: 'admitted'; member: LoungeMemberDto; flightNumber: string; guests: number }
  | { outcome: 'refused'; reason: 'too_many_guests' | 'no_ticket' | 'no_tier' | 'already_visited'; member: LoungeMemberDto }

/** `GET /staff/loyalty/lounge-visits`: visits on the current simulated day, newest first. */
export interface LoungeVisitDto {
  id: string
  time: string // HH:mm, UTC
  memberName: string
  tierName: string
  flightNumber: string
  guests: number
}

/** One cabin of a flight with award seats released (`GET /loyalty/award-flights`). */
export interface AwardCabinDto {
  cabin: string
  milesCost: number // per seat
  seatsLeft: number // award_limit less award seats held or sold
  totalMiles: number // milesCost × seats asked for
  enoughSeats: boolean
  balanceCovers: boolean | null // null when the caller is not a member
}

/** `GET /loyalty/award-flights`: one flight on the route and date, with its award cabins (empty when none released). */
export interface AwardFlightDto {
  flightId: string
  flightNumber: string
  origin: string
  originCity: string
  destination: string
  destinationCity: string
  originTimeZone: string // IANA zone of each airport, so times show as local
  destinationTimeZone: string
  departsAt: string
  arrivesAt: string
  durationMin: number
  cabins: AwardCabinDto[]
  closed: boolean // inside award_cutoff_hours of departure: miles are no longer accepted
}

export interface AwardSearchDto {
  asOf: string // the simulation clock's now
  seats: number
  milesBalance: number | null // null = not a member
  awardCutoffHours: number
  flights: AwardFlightDto[]
}

/** `GET /loyalty/award-routes`: routes with flights ahead, for the search form. */
export interface AwardRouteDto {
  origin: string
  originCity: string
  destination: string
  destinationCity: string
}

/** What `issueInsurancePolicy` and `cancelInsurancePolicy` hand back to feature 3b (and 5b for a refund). */
export interface InsurancePolicyDto {
  id: string
  policyNumber: string
  bookingId: string
  price: number
  currency: string
  status: 'active' | 'cancelled'
}

/** `POST /staff/loyalty/jobs/:name/run`: what one job run did at the simulated time `ranAt`. */
export interface JobRunResultDto {
  job: string
  ranAt: string
  counts: Record<string, number>
}
