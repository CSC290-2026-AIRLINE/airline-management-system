import type { ReportStatus } from './baggage.constants'
import type { FoundBagStatus } from './found-bag.types'

/** Same lists as the CHECKs on bag_delivery. */
export const DELIVERY_TYPES = ['home', 'hotel', 'other_address', 'airport_pickup'] as const
export type DeliveryType = (typeof DELIVERY_TYPES)[number]

export const DELIVERY_STATUSES = ['waiting_choice', 'preparing', 'in_transit', 'ready_for_pickup', 'delivered'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

/** The steps staff set by hand. delivered is only reached through a handover with an ownership check. */
export const STAFF_DELIVERY_STATUSES = ['in_transit', 'ready_for_pickup'] as const
export type StaffDeliveryStatus = (typeof STAFF_DELIVERY_STATUSES)[number]

/** Until the bag is in transit the passenger (or the desk, for them) can still change how it comes back. */
export const CHOICE_OPEN_STATUSES: DeliveryStatus[] = ['waiting_choice', 'preparing']

/** Identity documents the desk accepts at handover. */
export const ID_DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'] as const
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number]

/** Who came for the bag: the passenger, or someone they sent with the booking details. */
export const COLLECTORS = ['passenger', 'representative'] as const
export type Collector = (typeof COLLECTORS)[number]

/**
 * What did not agree with the case in a failed ownership check. document_type: the passenger has a passport on file but
 * showed another document.
 */
export const OWNERSHIP_MISMATCHES = ['booking_reference', 'last_name', 'document_type', 'document_number'] as const
export type OwnershipMismatch = (typeof OWNERSHIP_MISMATCHES)[number]

/** One ownership check at handover, read back from audit_log. Only the last 4 characters of the document are kept. */
export interface OwnershipCheck {
  id: string
  passed: boolean
  mismatches: OwnershipMismatch[]
  collector: Collector
  representativeName: string | null
  documentType: IdDocumentType
  documentLast4: string
  staffName: string | null
  checkedAt: Date
}

/** The confirmed found bag of a case, and where it is now. */
export interface DeliveryBag {
  id: string
  status: FoundBagStatus
  tagNumber: string | null
  currentAirport: string
  inTransit: boolean
  toAirport: string | null
}

/** A bag_delivery row as the Deliveries screen needs it, with its case, passenger and bag. Money is a 2-decimal string. */
export interface BagDelivery {
  id: string
  reportId: string
  caseNumber: string
  reportStatus: ReportStatus
  passengerFirstName: string
  passengerLastName: string
  bookingReference: string
  contactEmail: string | null
  contactPhone: string | null
  deliveryType: DeliveryType | null
  address: string | null
  pickupAirport: string | null
  status: DeliveryStatus
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
  foundBag: DeliveryBag | null
  totalCost: string
}

export interface BagDeliveryDetail extends BagDelivery {
  /** Newest first. */
  ownershipChecks: OwnershipCheck[]
}
