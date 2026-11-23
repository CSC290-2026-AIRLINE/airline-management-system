/**
 * Tracking actions follow the CHECK on bag_location_event.action.
 */
export const BAG_LOCATION_ACTIONS = ['found', 'held', 'sent', 'arrived', 'at_diverted_airport', 'out_for_delivery', 'delivered'] as const

export type BagLocationAction = (typeof BAG_LOCATION_ACTIONS)[number]

/**
 * What baggage staff record by hand. found is written by intake, at_diverted_airport by the diversion job, and
 * out_for_delivery and delivered by the delivery flow.
 */
export const STAFF_MOVE_ACTIONS = ['held', 'sent', 'arrived'] as const

export type StaffMoveAction = (typeof STAFF_MOVE_ACTIONS)[number]

export interface BagLocationEvent {
  id: string
  foundBagId: string
  airportCode: string
  action: BagLocationAction
  toAirport: string | null
  sentOnFlightId: string | null
  note: string | null
  staffId: string | null
  occurredAt: Date
  createdAt: Date
}

export interface BagLocation {
  /** Where the bag is, or the station it left from while in transit. */
  airportCode: string
  inTransit: boolean
  /** Set while in transit. */
  toAirport: string | null
  lastAction: BagLocationAction
  lastEventAt: Date
}

export interface BagTrackingHistory {
  foundBagId: string
  current: BagLocation | null
  events: BagLocationEvent[]
}
