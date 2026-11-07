import type { DeliveryType } from './bag-delivery.types'

/**
 * What the baggage desk is told about. Each one points at a row that needs a look:
 * strong_match: a strong match waits for review; new_report: a passenger reported a bag themselves;
 * delivery_to_send: the passenger has chosen how the bag comes back; unclaimed_soon: a held bag turns unclaimed within a
 * week; bag_unclaimed: a held bag turned unclaimed; case_lost: a case passed lost_after_days with no confirmed match.
 */
export const STAFF_NOTIFICATION_KINDS = [
  'strong_match',
  'new_report',
  'delivery_to_send',
  'unclaimed_soon',
  'bag_unclaimed',
  'case_lost',
] as const
export type StaffNotificationKind = (typeof STAFF_NOTIFICATION_KINDS)[number]

/**
 * One notification. id is `<kind>:<row id>`, so it stays the same between reads and the screen can remember which ones
 * were seen. targetId is the row to open: a match (strong_match), a found bag (unclaimed_soon, bag_unclaimed) or a case
 * (the others; Deliveries also opens a delivery by its case).
 */
export interface StaffNotification {
  id: string
  kind: StaffNotificationKind
  occurredAt: Date
  targetId: string
  caseNumber: string | null
  foundBagId: string | null
  airportCode: string | null
  passengerName: string | null
  deliveryType: DeliveryType | null
  /** unclaimed_soon: when the bag turns unclaimed. */
  dueAt: Date | null
}

export interface StaffNotificationFeed {
  generatedAt: Date
  /** Newest first. */
  items: StaffNotification[]
}
