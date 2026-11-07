import type { BagColour, BagType, ReportStatus } from './baggage.constants'
import type { FoundBagStatus } from './found-bag.types'

/** Same lists as the CHECKs on bag_match. */
export const MATCH_LEVELS = ['strong', 'possible', 'manual'] as const
export type MatchLevel = (typeof MATCH_LEVELS)[number]

export const MATCH_STATUSES = ['suggested', 'under_review', 'confirmed', 'rejected'] as const
export type MatchStatus = (typeof MATCH_STATUSES)[number]

/** Statuses a staff member can still confirm or reject. */
export const OPEN_MATCH_STATUSES: MatchStatus[] = ['suggested', 'under_review']

/** Report statuses that can still be matched: no confirmed match yet. A lost case stays matchable. */
export const MATCHABLE_REPORT_STATUSES: ReportStatus[] = ['open', 'lost']

/**
 * What a report and a found bag have in common. owner_tag: the found bag's Feature 6 bag belongs to the report's
 * booking passenger, so the tag names the owner even when the report has no tag.
 */
export const MATCH_REASONS = [
  'same_tag',
  'owner_tag',
  'same_flight',
  'same_type',
  'same_colour',
  'same_brand',
  'similar_description',
] as const
export type MatchReason = (typeof MATCH_REASONS)[number]

/** The report side of a match, enough to compare it with the bag without a second call. */
export interface MatchReportSide {
  id: string
  caseNumber: string
  status: ReportStatus
  passengerFirstName: string
  passengerLastName: string
  bookingReference: string
  flightId: string
  flightNumber: string
  flightDate: Date
  tagNumber: string | null
  bagType: BagType
  colour: BagColour
  brand: string | null
  description: string | null
  reportedAt: Date
  reportedByStaff: boolean
}

/** The found-bag side of a match. currentAirport is where its latest tracking event puts it. */
export interface MatchFoundBagSide {
  id: string
  status: FoundBagStatus
  tagNumber: string | null
  flightId: string | null
  flightNumber: string | null
  bagType: BagType | null
  colour: BagColour | null
  brand: string | null
  description: string | null
  foundAirport: string
  foundAt: Date
  currentAirport: string
}

export interface StaffName {
  id: string
  firstName: string
  lastName: string
}

/**
 * A bag_match row as the review screen needs it. score (0 to 100) and reasons are worked out when the match is read,
 * so they always reflect the latest report and bag details.
 */
export interface BagMatch {
  id: string
  level: MatchLevel
  status: MatchStatus
  score: number
  reasons: MatchReason[]
  linkedBy: StaffName | null
  reviewedBy: StaffName | null
  reviewNote: string | null
  suggestedAt: Date
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
  report: MatchReportSide
  foundBag: MatchFoundBagSide
}

export interface MatchRunResult {
  /** Matches added by this run. Pairs that already had a match row, rejected ones included, are left alone. */
  created: number
}
