import type { Collector, DeliveryStatus, DeliveryType, FoundBagStatus, IdDocumentType, OwnershipMismatch, ReportStatus } from '../constants'
import { useBaggageSend } from './found-bags'

/** Same shape as the backend's `OwnershipCheck` (`apps/backend/src/modules/baggage/common/bag-delivery.types.ts`). */
export interface OwnershipCheck {
  id: string
  passed: boolean
  mismatches: OwnershipMismatch[]
  collector: Collector
  representativeName: string | null
  documentType: IdDocumentType
  documentLast4: string
  staffName: string | null
  checkedAt: string
}

/** Same shape as the backend's `BagDelivery`, dates as ISO strings. */
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
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
  foundBag: {
    id: string
    status: FoundBagStatus
    tagNumber: string | null
    currentAirport: string
    inTransit: boolean
    toAirport: string | null
  } | null
  totalCost: string
}

export interface BagDeliveryDetail extends BagDelivery {
  ownershipChecks: OwnershipCheck[]
}

export interface DeliveryChoiceBody {
  deliveryType: DeliveryType
  address?: string
  pickupAirport?: string
}

export interface HandOverBody {
  bookingReference: string
  lastName: string
  collector: Collector
  representativeName?: string
  documentType: IdDocumentType
  documentNumber: string
  documentChecked: boolean
  note?: string
}

/** `/api/staff/bag-deliveries`. Same rule as `useFoundBagApi`: never list these functions as effect dependencies. */
export function useBagDeliveryApi() {
  const send = useBaggageSend()

  return {
    list: () => send<BagDelivery[]>('/api/staff/bag-deliveries'),
    get: (id: string) => send<BagDeliveryDetail>(`/api/staff/bag-deliveries/${id}`),
    recordChoice: (id: string, body: DeliveryChoiceBody) =>
      send<BagDeliveryDetail>(`/api/staff/bag-deliveries/${id}/choice`, { method: 'PUT', body: JSON.stringify(body) }),
    setStatus: (id: string, status: 'in_transit' | 'ready_for_pickup') =>
      send<BagDeliveryDetail>(`/api/staff/bag-deliveries/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    handOver: (id: string, body: HandOverBody) =>
      send<BagDeliveryDetail>(`/api/staff/bag-deliveries/${id}/hand-over`, { method: 'POST', body: JSON.stringify(body) }),
  }
}
