import type { PassengerDeliveryChoice } from '../components/DeliveryChoiceForm'

type DeliveryType = PassengerDeliveryChoice['deliveryType'] | 'airport_pickup'

export type PassengerCaseTimelineEvent =
  | { type: 'report_received'; occurredAt: string }
  | { type: 'case_marked_lost'; occurredAt: string }
  | { type: 'match_confirmed'; occurredAt: string }
  | { type: 'choice_saved'; occurredAt: string; deliveryType: DeliveryType; chosenBy: 'passenger' | 'staff' }
  | { type: 'bag_sent'; occurredAt: string; fromAirport: string; toAirport: string }
  | { type: 'bag_arrived'; occurredAt: string; airport: string }
  | { type: 'out_for_delivery'; occurredAt: string; airport: string }
  | { type: 'bag_delivered'; occurredAt: string }
  | { type: 'case_closed'; occurredAt: string }
  | { type: 'case_cancelled'; occurredAt: string }

const DELIVERY_LABELS: Record<DeliveryType, string> = {
  home: 'Home',
  hotel: 'Hotel',
  other_address: 'Other address',
  airport_pickup: 'Airport pickup',
}

export function timelineEventLabel(event: PassengerCaseTimelineEvent): string {
  switch (event.type) {
    case 'report_received':
      return 'Report received'
    case 'case_marked_lost':
      return 'Case marked lost'
    case 'match_confirmed':
      return 'Staff confirmed a found bag is yours'
    case 'choice_saved':
      if (event.chosenBy === 'passenger') {
        if (event.deliveryType === 'home') return 'You chose delivery to your home'
        if (event.deliveryType === 'hotel') return 'You chose delivery to your hotel'
        if (event.deliveryType === 'other_address') return 'You chose delivery to another address'
        return 'You chose airport pickup'
      }
      return `Your ${DELIVERY_LABELS[event.deliveryType].toLowerCase()} choice was recorded`
    case 'bag_sent':
      return `Bag sent from ${event.fromAirport} to ${event.toAirport}`
    case 'bag_arrived':
      return `Bag arrived at ${event.airport}`
    case 'out_for_delivery':
      return `Bag out for delivery at ${event.airport}`
    case 'bag_delivered':
      return 'Bag delivered'
    case 'case_closed':
      return 'Case closed'
    case 'case_cancelled':
      return 'Case cancelled'
  }
}
