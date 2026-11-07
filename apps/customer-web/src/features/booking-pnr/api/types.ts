export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'
export type PassengerType = 'adult' | 'child' | 'infant'
export type ServiceCode = 'WCHR' | 'WCHS' | 'WCHC' | 'UMNR' | 'MEDA'
export type ServiceRequestStatus = 'requested' | 'accepted' | 'rejected' | 'completed'
export type SeatType = 'standard' | 'extra_legroom' | 'exit'

export interface BookingPassenger {
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  passengerType: PassengerType
  seatCode: string | null
}

export interface BookingSegment {
  bookingSegmentId: string
  flightId: string
  segmentOrder: number
  cabin: string
  fareClassId: string | null
  origin?: string
  destination?: string
  depAt?: string
}

export interface BookingCoupon {
  couponId: string
  bookingPassengerId: string
  passengerId: string
  bookingSegmentId: string
  flightId: string
  ticketNumber: string | null
  status: BookingStatus
  priceTotal: number
}

export interface BookingServiceRequest {
  serviceRequestId: string
  bookingPassengerId: string
  bookingSegmentId: string | null
  serviceCode: ServiceCode
  status: ServiceRequestStatus
  note: string | null
}

export interface BookingSummary {
  bookingId: string
  reference: string
  status: BookingStatus
  contactEmail: string
  contactPhone: string | null
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
}

export interface SeatDefinition {
  seatCode: string
  row: number
  column: string
  type: SeatType
  available: boolean
}

export interface SeatRow {
  row: number
  seats: SeatDefinition[]
}

export interface SeatMap {
  aircraftTypeId?: string
  rows: SeatRow[]
}

export interface HoldBookingPassenger {
  passengerId: string
  passengerType: PassengerType
}

export interface HoldBookingSegment {
  flightId: string
  cabin: Cabin | string
  fareClassCode: string
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
  paymentType: 'cash' | 'miles'
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
}

export interface CancelPreview {
  fee: number
  refund: number
  currency: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
