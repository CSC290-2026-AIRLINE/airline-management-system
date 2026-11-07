import type { Prisma } from '@backend/db/generated/prisma/client'

export type BookingTransaction = Prisma.TransactionClient

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type BookingStatus = 'held' | 'confirmed' | 'cancelled' | 'expired'
export type CouponStatus = BookingStatus
export type PassengerType = 'adult' | 'child' | 'infant'
export type CouponCancelReason = 'customer_request' | 'staff_request' | 'flight_cancelled' | 'rebooked_partner' | 'changed'
export type SeatStatus = 'held' | 'assigned' | 'released'
export type ServiceCode = 'WCHR' | 'WCHS' | 'WCHC' | 'UMNR' | 'MEDA'
export type ServiceRequestStatus = 'requested' | 'accepted' | 'rejected' | 'completed'

export const BOOKING_CLOCK = Symbol('BOOKING_CLOCK')
export const INVENTORY_PORT = Symbol('INVENTORY_PORT')
export const SEAT_PORT = Symbol('SEAT_PORT')
export const SERVICE_REQUEST_PORT = Symbol('SERVICE_REQUEST_PORT')
export const PRICING_PORT = Symbol('PRICING_PORT')
export const LOYALTY_PORT = Symbol('LOYALTY_PORT')
export const CHECKOUT_PORT = Symbol('CHECKOUT_PORT')
export const REFUND_PORT = Symbol('REFUND_PORT')
export const SCREENING_PORT = Symbol('SCREENING_PORT')
export const SEAT_MAP_PORT = Symbol('SEAT_MAP_PORT')
export const BOOKING_READ_PORT = Symbol('BOOKING_READ_PORT')
export const CANCEL_FOR_FLIGHT_PORT = Symbol('CANCEL_FOR_FLIGHT_PORT')
export const FLIGHT_EVENT_BUS = Symbol('FLIGHT_EVENT_BUS')
export const BOOKING_PROVIDER = Symbol('BOOKING_PROVIDER')

export interface BookingClock {
  now: () => Date
}

export interface Party {
  adults: number
  children: number
  infants: number
}

export interface InventoryKey {
  flightId: string
  cabin: Cabin | string
}

export interface FlightAvailabilityRequest {
  flightId: string
  cabin: Cabin | string
}

export interface FlightAvailability {
  flightId: string
  cabin: string
  seatsLeft: number
}

export interface InventoryCabin {
  cabin: Cabin | string
  capacity: number
  awardLimit?: number
}

export interface InventoryPort {
  lock: (tx: BookingTransaction, keys: InventoryKey[]) => Promise<void>
  hold: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  sell: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  release: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  returnSold: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  createForFlight: (flightId: string, cabins: InventoryCabin[]) => Promise<void>
  setCapacity: (tx: BookingTransaction, flightId: string, cabin: Cabin | string, capacity: number) => Promise<void>
  setAwardSeats: (flightId: string, cabin: Cabin | string, count: number) => Promise<void>
  seatsLeft: (flightId: string, cabin: Cabin | string) => Promise<number>
  availability: (flights: FlightAvailabilityRequest[], party: Party) => Promise<FlightAvailability[]>
}

export interface HoldSeatInput {
  bookingCouponId: string
  flightId: string
  seatCode: string
}

export interface SeatPort {
  holdForBooking: (tx: BookingTransaction, bookingId: string, seats: HoldSeatInput[], expiresAt: Date) => Promise<void>
  assignForBooking: (tx: BookingTransaction, bookingId: string, assignedAt: Date) => Promise<void>
  releaseForBooking: (tx: BookingTransaction, bookingId: string, releasedAt: Date) => Promise<void>
}

export interface ServiceRequestInput {
  bookingId: string
  bookingPassengerId: string
  bookingSegmentId?: string | null
  serviceCode: ServiceCode
  note?: string | null
  requestedAt: Date
}

export interface ServiceRequestPort {
  createForHold: (tx: BookingTransaction, requests: ServiceRequestInput[]) => Promise<void>
}

export interface FareQuoteRequest {
  flightId: string
  cabin: Cabin | string
  fareClassCode?: string
  promoCode?: string
  passengerType?: PassengerType
  seatType?: string
}

export interface FareQuoteLine {
  kind: string
  label: string
  amount: number
}

export interface FareQuote {
  currency: string
  total: number
  lines: FareQuoteLine[]
}

export interface CancelQuoteRequest {
  bookingId: string
  couponIds?: string[]
}

export interface CancelQuote {
  currency: string
  fee: number
  refund: number
}

export interface SeatFeeRequest {
  flightId: string
  cabin: Cabin | string
  seatType: string
}

export interface PricingPort {
  quote: (request: FareQuoteRequest) => Promise<FareQuote>
  cancelQuote: (request: CancelQuoteRequest) => Promise<CancelQuote>
  seatFee: (request: SeatFeeRequest) => Promise<number>
}

export interface AwardQuoteRequest extends FareQuoteRequest {
  passengerCount: number
}

export interface MilesQuote {
  miles: number
  taxes: FareQuote
}

export interface LoyaltyPort {
  isEnabled: () => boolean
  quoteAward: (request: AwardQuoteRequest) => Promise<MilesQuote | null>
}

export interface ChargeRequest {
  bookingId: string
  amount: number
  currency: string
  idempotencyKey: string
}

export interface PaymentResult {
  paymentId: string
  amount: number
  currency: string
}

export interface CheckoutPort {
  charge: (request: ChargeRequest) => Promise<PaymentResult>
}

export interface RefundRequest {
  bookingId: string
  amount: number
  currency: string
  reason: string
}

export interface RefundPort {
  record: (request: RefundRequest) => Promise<void>
}

export interface ScreeningRequest {
  passengerIds: string[]
}

export interface ScreeningResult {
  result: 'clear' | 'review' | 'denied'
  reasons: string[]
}

export interface ScreeningPort {
  screen: (request: ScreeningRequest) => Promise<ScreeningResult>
}

export type SeatType = 'standard' | 'extra_legroom' | 'exit'

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

export interface SeatMapPort {
  getSeatMap: (flightId: string) => Promise<SeatMap>
}

export interface BookingSummary {
  bookingId: string
  reference: string
  status: BookingStatus
  customerId: string
  contactEmail: string
  contactPhone: string | null
  bookedAt: Date
  holdExpiresAt: Date
  confirmedAt: Date | null
  cancelledAt: Date | null
}

export interface BookingPassengerDto {
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  passengerType: PassengerType
  seatCode: string | null
}

export interface BookingSegmentDto {
  bookingSegmentId: string
  flightId: string
  segmentOrder: number
  cabin: string
  fareClassId: string | null
}

export interface BookingCouponDto {
  couponId: string
  bookingPassengerId: string
  passengerId: string
  bookingSegmentId: string
  flightId: string
  ticketNumber: string | null
  status: CouponStatus
  priceTotal: number
}

export interface BookingServiceRequestDto {
  serviceRequestId: string
  bookingPassengerId: string
  bookingSegmentId: string | null
  serviceCode: ServiceCode
  status: ServiceRequestStatus
  note: string | null
}

export interface BookingDetail extends BookingSummary {
  passengers: BookingPassengerDto[]
  segments: BookingSegmentDto[]
  coupons: BookingCouponDto[]
  serviceRequests: BookingServiceRequestDto[]
}

export interface BookingListQuery {
  search?: string
  status?: BookingStatus
  flightId?: string
  page?: number
  pageSize?: number
}

export interface BookingPage {
  items: BookingSummary[]
  page: number
  pageSize: number
  total: number
}

export interface FlightPassengerDto {
  bookingReference: string
  passengerId: string
  firstName: string
  lastName: string
  contactEmail: string
  contactPhone: string | null
  seatCode: string | null
  serviceCodes: ServiceCode[]
}

export interface UpcomingFlightDto {
  bookingId: string
  reference: string
  status: BookingStatus
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  depAt: Date
}

export interface BookingReadPort {
  getBooking: (reference: string) => Promise<BookingDetail | null>
  findBookingByReferenceAndSurname: (reference: string, surname: string) => Promise<BookingDetail | null>
  listFlightPassengers: (flightId: string) => Promise<FlightPassengerDto[]>
  listCustomerBookings: (customerId: string) => Promise<UpcomingFlightDto[]>
  searchStaffBookings: (query: BookingListQuery) => Promise<BookingPage>
  getStaffBookingDetail: (bookingId: string) => Promise<BookingDetail | null>
  getBookingForCustomer: (bookingId: string, customerId: string) => Promise<BookingDetail | null>
}

export interface FlightEvent {
  id: string
  flightId: string
  type: string
  occurredAt: Date
  newAircraftId?: string | null
  partnerAirline?: string | null
}

export interface CancelForFlightResult {
  eventId: string
  cancelledBookings: number
  cancelledCoupons: number
  refundAmount: number
}

export interface CancelForFlightPort {
  cancelBookingsForFlight: (tx: BookingTransaction, flightId: string, event: FlightEvent) => Promise<CancelForFlightResult>
}

export interface FlightEventBus {
  subscribe: (handler: (event: FlightEvent) => Promise<void>) => () => void
  publish: (event: FlightEvent) => Promise<void>
}
