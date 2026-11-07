import type { DeliveryType, StaffNotificationKind } from '../constants'
import { useBaggageSend } from './found-bags'

/** Same shape as the backend's `StaffNotification` (`common/staff-notification.types.ts`), dates as ISO strings. */
export interface StaffNotification {
  id: string
  kind: StaffNotificationKind
  occurredAt: string
  targetId: string
  caseNumber: string | null
  foundBagId: string | null
  airportCode: string | null
  passengerName: string | null
  deliveryType: DeliveryType | null
  dueAt: string | null
}

export interface StaffNotificationFeed {
  generatedAt: string
  items: StaffNotification[]
}

/** `/api/staff/baggage-notifications`. Same rule as `useFoundBagApi`: never list it as an effect dependency. */
export function useNotificationApi() {
  const send = useBaggageSend()

  return { feed: () => send<StaffNotificationFeed>('/api/staff/baggage-notifications') }
}
