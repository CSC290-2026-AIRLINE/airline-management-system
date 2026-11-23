import type { DeliveryStatus, DeliveryType } from './bag-delivery.types'
import type { ReportStatus } from './baggage.constants'

export type PassengerCaseTimelineEvent =
  | { type: 'report_received'; occurredAt: Date }
  | { type: 'case_marked_lost'; occurredAt: Date }
  | { type: 'match_confirmed'; occurredAt: Date }
  | { type: 'choice_saved'; occurredAt: Date; deliveryType: DeliveryType; chosenBy: 'passenger' | 'staff' }
  | { type: 'bag_sent'; occurredAt: Date; fromAirport: string; toAirport: string }
  | { type: 'bag_arrived'; occurredAt: Date; airport: string }
  | { type: 'out_for_delivery'; occurredAt: Date; airport: string }
  | { type: 'bag_delivered'; occurredAt: Date }
  | { type: 'case_closed'; occurredAt: Date }
  | { type: 'case_cancelled'; occurredAt: Date }

export interface PassengerCaseSummary {
  caseNumber: string
  status: ReportStatus
  reportedAt: Date
  lostAt: Date | null
  closedAt: Date | null
  passenger: { firstName: string; lastName: string }
  flight: { flightNumber: string; serviceDate: Date; origin: string; destination: string }
  bag: { type: string; colour: string; brand: string | null; tagNumber: string | null; description: string | null }
  delivery: {
    deliveryType: DeliveryType | null
    address: string | null
    pickupAirport: string | null
    status: DeliveryStatus
  } | null
  timeline: PassengerCaseTimelineEvent[]
}
