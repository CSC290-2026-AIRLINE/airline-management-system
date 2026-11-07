// JSON shapes of Feature 3's booking API for staff-web. They mirror apps/backend/src/modules/booking-pnr/contracts.ts
// (dates are ISO strings here) and match customer-web's features/booking-pnr/api/types.ts. Change them together.
export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'
export type PassengerType = 'adult' | 'child' | 'infant'
export type TripType = 'one_way' | 'return' | 'multi_city'
export type PaymentType = 'cash' | 'miles'
export type CouponCancelReason = 'customer_request' | 'staff_request' | 'flight_cancelled' | 'rebooked_partner' | 'changed'
export type ServiceCode = 'WCHR' | 'WCHS' | 'WCHC' | 'UMNR' | 'MEDA'
export type ServiceRequestStatus = 'requested' | 'accepted' | 'rejected' | 'completed'
export type SeatType = 'standard' | 'extra_legroom' | 'exit'
export type SeatState = 'available' | 'held' | 'taken' | 'blocked'

export interface BookingPassenger {
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  passengerType: PassengerType
  lapOfBookingPassengerId: string | null
}

export interface BookingSegment {
  bookingSegmentId: string
  flightId: string
  segmentOrder: number
  cabin: Cabin
  fareClassId: string | null
  fareClassCode: string | null
  flightNumber: string
  origin: string
  destination: string
  depAt: string
  arrAt: string
}

export interface BookingCoupon {
  couponId: string
  bookingPassengerId: string
  passengerId: string
  bookingSegmentId: string
  flightId: string
  // 13 digits as stored; show it as "217-4400123456" (D11).
  ticketNumber: string | null
  status: BookingStatus
  cancelReason: CouponCancelReason | null
  priceTotal: number
  seatCode: string | null
}

export interface BookingServiceRequest {
  serviceRequestId: string
  bookingPassengerId: string
  bookingSegmentId: string | null
  serviceCode: ServiceCode
  // Show 'requested' as "Pending" (D13).
  status: ServiceRequestStatus
  note: string | null
  decisionNote: string | null
  requestedAt: string
}

// The details dialog's history list (D7).
export interface BookingHistoryEntry {
  at: string
  event: 'held' | 'confirmed' | 'expired' | 'cancelled'
  byStaffId: string | null
}

export interface BookingSummary {
  bookingId: string
  reference: string
  status: BookingStatus
  tripType: TripType
  paymentType: PaymentType
  customerId: string
  bookedByStaffId: string | null
  contactEmail: string
  contactPhone: string | null
  currency: string
  total: number
  bookedAt: string
  holdExpiresAt: string
  confirmedAt: string | null
  cancelledAt: string | null
}

export interface BookingDetail extends BookingSummary {
  passengers: BookingPassenger[]
  segments: BookingSegment[]
  coupons: BookingCoupon[]
  serviceRequests: BookingServiceRequest[]
  history: BookingHistoryEntry[]
  serverNow: string
}

// One row of the staff Bookings table (B13).
export interface BookingListItem extends BookingSummary {
  leadPassengerName: string
  trip: string
  travelDate: string | null
  openServiceRequests: number
}

export interface SeatDefinition {
  seatCode: string
  row: number
  column: string
  cabin: Cabin
  type: SeatType
  state: SeatState
  fee: number
}

export interface SeatRow {
  row: number
  seats: SeatDefinition[]
}

export interface SeatMap {
  flightId: string
  cabins: Array<{ cabin: Cabin; capacity: number }>
  rows: SeatRow[]
}

export interface HoldBookingPassenger {
  passengerId: string
  passengerType: PassengerType
  // Infants only: the passengerId of the adult whose lap the infant sits on.
  lapOfPassengerId?: string | null
}

export interface HoldBookingSegment {
  flightId: string
  cabin: Cabin
  fareClassId: string | null
  fareQuoteId?: string | null
}

export interface HoldBookingSeat {
  passengerId: string
  flightId: string
  seatCode: string
}

export interface HoldBookingServiceRequest {
  passengerId: string
  flightId?: string
  serviceCode: ServiceCode
  note?: string
}

export interface HoldBookingRequest {
  tripType: TripType
  paymentType: PaymentType
  passengers: HoldBookingPassenger[]
  segments: HoldBookingSegment[]
  contactEmail: string
  contactPhone?: string
  promoCode?: string
  expectedTotal: number
  seats?: HoldBookingSeat[]
  serviceRequests?: HoldBookingServiceRequest[]
}

// POST /staff/bookings (A4). Staff book only for an existing customer until Feature 7 answers D6.
export interface BookForCustomerRequest extends HoldBookingRequest {
  customerId: string
}

export interface HoldBookingResponse {
  bookingId: string
  reference: string
  total: number
  currency: string
  holdExpiresAt: string
}

export interface PriceChangedDetails {
  previousTotal: number
  newTotal: number
  currency: string
}

export interface SeatUnavailableDetails {
  flightId: string
  cabin?: Cabin
  seatCode?: string | null
}

// GET /staff/bookings (A's B7 lookup routes, D7). The filters apply only when `search` is empty. Dates are YYYY-MM-DD;
// the page turns a period (today, this week, this month, this year, last year) into from/to.
export interface StaffBookingQuery {
  // Reference, passenger name, ticket number or passport.
  search?: string
  dateType?: 'booked' | 'travelling'
  from?: string
  to?: string
  status?: BookingStatus
  flightId?: string
  page?: number
  pageSize?: number
}

export interface StaffBookingPage {
  items: BookingListItem[]
  page: number
  pageSize: number
  total: number
}

export interface StaffCancelRequest {
  reason: string
  // Logged in Feature 15 (D8).
  waiveFee: boolean
}

export interface CancelPreview {
  fee: number
  refund: number
  currency: string
  milesReturned?: number | null
}

export interface ServiceRequestListQuery {
  status?: ServiceRequestStatus
  flightId?: string
}

// One row of the Special Assistance Queue (C11): oldest departure first (D10).
export interface ServiceRequestQueueItem extends BookingServiceRequest {
  bookingReference: string
  passengerName: string
  passengerType: PassengerType
  flightNumber: string | null
  depAt: string | null
}

export interface ServiceRequestUpdate {
  status: Exclude<ServiceRequestStatus, 'requested'>
  // Required when rejecting; shown to the customer.
  decisionNote?: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
