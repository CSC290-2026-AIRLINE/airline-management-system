import type { BagColour, BagCostKind, BagType, ReportStatus } from '../constants'
import { useBaggageSend } from './found-bags'

/** Same shape as the backend's `LostReportCase` (`apps/backend/src/modules/baggage/common/lost-report.types.ts`), dates as ISO strings. */
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
  flightDate: string
  flightOrigin: string
  /** Where the flight landed: the diversion airport when it was diverted. */
  flightDestination: string
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
  reportedAt: string
  lostAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

/** One recovery or delivery cost of a case. Money is a 2-decimal string in the finance base currency (baht). */
export interface BagCost {
  id: string
  reportId: string
  expenseId: string
  kind: BagCostKind
  amount: string
  description: string
  incurredOn: string
  createdBy: string
  createdAt: string
}

export interface BagCostSummary {
  reportId: string
  caseNumber: string
  total: string
  costs: BagCost[]
}

/** A ticketed passenger and flight on a booking (backend `BookingCoupon`). Only `confirmed` coupons can have a case. */
export interface BookingCoupon {
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  flightId: string
  flightNumber: string
  flightDate: string
  status: string
}

export interface BookingLookup {
  bookingReference: string
  contactEmail: string
  contactPhone: string | null
  coupons: BookingCoupon[]
}

/** Body of `POST /api/staff/lost-reports`. Contact details left out are taken from the booking. */
export interface CreateLostReportBody {
  bookingReference: string
  passengerId: string
  flightId: string
  bagType: BagType
  colour: BagColour
  tagNumber?: string
  brand?: string
  description?: string
  contactEmail?: string
  contactPhone?: string
}

export interface AddBagCostBody {
  kind: BagCostKind
  amount: number
  note?: string
}

/** `/api/staff/lost-reports`. Same rule as `useFoundBagApi`: never list these functions as effect dependencies. */
export function useLostReportApi() {
  const send = useBaggageSend()

  return {
    list: () => send<LostReportCase[]>('/api/staff/lost-reports'),
    lookupBooking: (reference: string) => send<BookingLookup>(`/api/staff/lost-reports/bookings/${encodeURIComponent(reference)}`),
    create: (body: CreateLostReportBody) => send<LostReportCase>('/api/staff/lost-reports', { method: 'POST', body: JSON.stringify(body) }),
    createFromFoundBag: (foundBagId: string) =>
      send<LostReportCase>('/api/staff/lost-reports/from-found-bag', { method: 'POST', body: JSON.stringify({ foundBagId }) }),
    costs: (id: string) => send<BagCostSummary>(`/api/staff/lost-reports/${id}/costs`),
    addCost: (id: string, body: AddBagCostBody) =>
      send<BagCost>(`/api/staff/lost-reports/${id}/costs`, { method: 'POST', body: JSON.stringify(body) }),
    removeCost: (id: string, costId: string) => send<void>(`/api/staff/lost-reports/${id}/costs/${costId}`, { method: 'DELETE' }),
  }
}
