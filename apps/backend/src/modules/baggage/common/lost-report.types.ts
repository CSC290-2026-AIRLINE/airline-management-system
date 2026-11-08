import type { BagColour, BagType, ReportStatus } from './baggage.constants'

/**
 * A lost bag case as the baggage desk sees it: the lost_bag_report row plus the passenger, booking and flight it
 * belongs to, so staff do not need a second lookup. Passenger routes on feat-10-lost-baggage-report use their own type.
 */
export interface LostReportCase {
  id: string
  caseNumber: string

  bookingPassengerId: string
  passengerId: string
  flightId: string

  bookingReference: string
  passengerFirstName: string
  passengerLastName: string
  flightNumber: string
  flightDate: Date
  flightOrigin: string

  reportedByCustomerId: string | null
  reportedByStaffId: string | null

  tagNumber: string | null
  bagType: BagType
  colour: BagColour
  brand: string | null
  description: string | null
  photoUrl: string | null

  contactEmail: string | null
  contactPhone: string | null

  status: ReportStatus

  reportedAt: Date
  lostAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** A ticketed passenger and flight on a booking, so staff can pick who is reporting and for which flight. */
export interface BookingCoupon {
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  flightId: string
  flightNumber: string
  flightDate: Date
  status: string
}

export interface BookingLookup {
  bookingReference: string
  contactEmail: string
  contactPhone: string | null
  coupons: BookingCoupon[]
}

/** Same list as the CHECK on bag_cost.kind. */
export const BAG_COST_KINDS = ['forwarding', 'delivery', 'storage', 'other'] as const

export type BagCostKind = (typeof BAG_COST_KINDS)[number]

/** Below the NUMERIC(12, 2) limit of expense.amount. */
export const MAX_COST_AMOUNT = 9_999_999_999.99

/** One recovery or delivery cost of a case. The amount is Feature 4's expense row; money is a 2-decimal string. */
export interface BagCost {
  id: string
  reportId: string
  expenseId: string
  kind: BagCostKind
  amount: string
  description: string
  incurredOn: string
  createdBy: string
  createdAt: Date
}

export interface BagCostSummary {
  reportId: string
  caseNumber: string
  total: string
  costs: BagCost[]
}
