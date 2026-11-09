// JSON shapes of Feature 3's booking API. They mirror apps/backend/src/modules/booking-pnr/contracts.ts (dates are ISO
// strings here). Change both in the same PR.
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
  // The adult this infant travels with.
  lapOfBookingPassengerId: string | null
}

export interface BookingSegment {
  bookingSegmentId: string
  flightId: string
  segmentOrder: number
  cabin: Cabin
  // Null for an award seat paid with miles.
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
  // Null shows "Seat not chosen" with a Choose seat link.
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
  // The simulation clock's now: countdown = holdExpiresAt - serverNow.
  serverNow: string
}

// One card of My Trips (GET /customers/me/bookings).
export interface BookingListItem extends BookingSummary {
  leadPassengerName: string
  trip: string
  travelDate: string | null
  openServiceRequests: number
}

// One seat of GET /flights/:id/seat-map (C1).
export interface SeatDefinition {
  seatCode: string
  row: number
  column: string
  cabin: Cabin
  type: SeatType
  state: SeatState
  // Seat fee when chosen after booking; 0 while booking (priced in the fare quote).
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
  // From the search result. Null for an award seat paid with miles.
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
  // Omit for every segment.
  flightId?: string
  serviceCode: ServiceCode
  note?: string
}

// POST /bookings, sent when the customer leaves the Seat step (D3). Header: Idempotency-Key.
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

export interface HoldBookingResponse {
  bookingId: string
  reference: string
  total: number
  currency: string
  holdExpiresAt: string
}

// POST /dev/bookings/:ref/confirm, B1's dev stand-in for checkout (Feature 5a).
export interface ConfirmBookingResult {
  bookingId: string
  reference: string
  status: 'confirmed'
  total: number
  holdExpiresAt: string
  confirmedAt: string
}

// `details` of 409 PRICE_CHANGED: nothing is held; send the hold again with expectedTotal = newTotal.
export interface PriceChangedDetails {
  previousTotal: number
  newTotal: number
  currency: string
}

// `details` of 409 SEAT_UNAVAILABLE: the cabin is full, or seatCode was just taken.
export interface SeatUnavailableDetails {
  flightId: string
  cabin?: Cabin
  seatCode?: string | null
}

export interface CancelPreview {
  fee: number
  refund: number
  currency: string
  // Miles that come back for a miles booking.
  milesReturned?: number | null
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
