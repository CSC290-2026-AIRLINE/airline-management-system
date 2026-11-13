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
export const BOOKING_EVENT_BUS = Symbol('BOOKING_EVENT_BUS')
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
  cabin: string
}

export interface FlightAvailabilityRequest {
  flightId: string
  cabin: string
}

export interface FlightAvailability {
  flightId: string
  cabin: string
  seatsLeft: number
}

export interface InventoryCabin {
  cabin: string
  capacity: number
  awardLimit?: number
}

export interface InventoryPort {
  lock: (tx: BookingTransaction, keys: InventoryKey[]) => Promise<void>
  hold: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  sell: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  release: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  returnSold: (tx: BookingTransaction, keys: InventoryKey[], count: number, award?: boolean) => Promise<void>
  createForFlight: (flightId: string, cabins: InventoryCabin[], tx?: BookingTransaction) => Promise<void>
  setCapacity: (tx: BookingTransaction, flightId: string, cabin: string, capacity: number) => Promise<void>
  setAwardSeats: (flightId: string, cabin: string, count: number) => Promise<void>
  seatsLeft: (flightId: string, cabin: string) => Promise<number>
  availability: (flights: FlightAvailabilityRequest[], party: Party) => Promise<FlightAvailability[]>
}

export interface HoldSeatInput {
  bookingCouponId: string
  flightId: string
  seatCode: string
}

export interface SeatPort {
  holdForBooking: (tx: BookingTransaction, bookingId: string, seats: HoldSeatInput[], expiresAt: Date) => Promise<void>
  assignHeldForBooking: (tx: BookingTransaction, bookingId: string, assignedAt: Date) => Promise<void>
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

// Feature 4 prices one passenger for one flight, cabin and fare class. Its quote has no passenger type: a child pays the
// quote and a lap infant pays 0 until Feature 4 decides (schema review #7). `booking_segment.fare_class_id` and
// `booking_coupon.fare_quote_id` are foreign keys, so the ids travel from search through the hold.
export interface FareQuoteRequest {
  flightId: string
  cabin: Cabin
  fareClassId: string
  promoCode?: string
  seatType?: string
}

export interface FareQuoteLine {
  kind: string
  label: string
  amount: number
}

export interface FareQuote {
  // Feature 4's fare_quote.id. Null only for a lap infant, which is not priced, so the coupon stores null.
  fareQuoteId: string | null
  fareClassId: string
  currency: string
  pricePerPassenger: number
  // The quote's fare_rule_snapshot: the cancellation rules the booking was sold under (B6).
  fareRuleSnapshot: Record<string, unknown> | null
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
  cabin: string
  seatType: string
}

export interface PricingPort {
  quote: (request: FareQuoteRequest) => Promise<FareQuote>
  cancelQuote: (request: CancelQuoteRequest) => Promise<CancelQuote>
  seatFee: (request: SeatFeeRequest) => Promise<number>
  // Counts the promo use once per quote at confirm (B1). Feature 4's `PromoCodeService.redeem`.
  redeem: (promoCode: string, fareQuoteId: string, bookingRef: string) => Promise<void>
}

// An award seat has no fare class (booking_segment.fare_class_id is null for miles).
export interface AwardQuoteRequest {
  flightId: string
  cabin: Cabin
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
  purchaseRef?: string
}

export interface PaymentResult {
  paymentId: string
  amount: number
  currency: string
}

export interface CheckoutPort {
  charge: (request: ChargeRequest, tx?: BookingTransaction) => Promise<PaymentResult>
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
// The state C1 adds for the seat-map route, from seat_assignment (held, assigned) and the layout (blocked).
export type SeatState = 'available' | 'held' | 'taken' | 'blocked'

// One seat of Feature 9's layout. `blocked` comes from the layout; held and taken come from seat_assignment.
export interface SeatDefinition {
  seatCode: string
  row: number
  column: string
  cabin: Cabin
  type: SeatType
  blocked: boolean
}

export interface SeatRow {
  row: number
  seats: SeatDefinition[]
}

// Sellable seats per cabin (blocked seats left out). C7's flight.created handler passes these to
// InventoryPort.createForFlight, and an aircraft change passes them to setCapacity.
export interface SeatMapCabin {
  cabin: Cabin
  capacity: number
}

export interface SeatMap {
  aircraftTypeId?: string
  cabins: SeatMapCabin[]
  rows: SeatRow[]
}

export interface SeatMapPort {
  getSeatMap: (flightId: string) => Promise<SeatMap>
}

export type TripType = 'one_way' | 'return' | 'multi_city'
export type PaymentType = 'cash' | 'miles'

export interface BookingSummary {
  bookingId: string
  reference: string
  status: BookingStatus
  tripType: TripType
  paymentType: PaymentType
  customerId: string
  // Set when an agent booked it (staff Book for Customer); null when the customer booked it.
  bookedByStaffId: string | null
  contactEmail: string
  contactPhone: string | null
  currency: string
  // Sum of the coupons' price_total; not stored on the booking.
  total: number
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
  // The adult this infant travels with (booking_passenger.lap_of_id).
  lapOfBookingPassengerId: string | null
}

export interface BookingSegmentDto {
  bookingSegmentId: string
  flightId: string
  segmentOrder: number
  cabin: Cabin
  // Null for an award seat paid with miles.
  fareClassId: string | null
  fareClassCode: string | null
  // Read live from Feature 2's flight and route; Feature 3 stores no flight times.
  flightNumber: string
  origin: string
  destination: string
  depAt: Date
  arrAt: Date
}

export interface BookingCouponDto {
  couponId: string
  bookingPassengerId: string
  passengerId: string
  bookingSegmentId: string
  flightId: string
  ticketNumber: string | null
  status: CouponStatus
  cancelReason: CouponCancelReason | null
  priceTotal: number
  // The coupon's assigned seat, or null ("Seat not chosen"). Infants have no seat.
  seatCode: string | null
}

// Built from booked_at, confirmed_at, cancelled_at and booked_by_staff_id; there is no history table (D7).
export interface BookingHistoryEntry {
  at: Date
  event: 'held' | 'confirmed' | 'expired' | 'cancelled'
  byStaffId: string | null
}

export interface BookingServiceRequestDto {
  serviceRequestId: string
  bookingPassengerId: string
  bookingSegmentId: string | null
  serviceCode: ServiceCode
  status: ServiceRequestStatus
  note: string | null
  // Why staff rejected it; shown to the customer.
  decisionNote: string | null
  requestedAt: Date
}

export interface BookingDetail extends BookingSummary {
  passengers: BookingPassengerDto[]
  segments: BookingSegmentDto[]
  coupons: BookingCouponDto[]
  serviceRequests: BookingServiceRequestDto[]
  history: BookingHistoryEntry[]
  // The simulation clock's now, so the page can show the hold countdown (B4, B9).
  serverNow: Date
}

// Who is reading: a customer sees only their own bookings (any other reference answers 404); staff see all.
export interface BookingViewer {
  customerId?: string
  staff?: boolean
}

// Staff Bookings lookup (B7 lookup routes, D7). The filters apply only when `search` is empty.
export interface BookingListQuery {
  // Reference, passenger name, ticket number or passport.
  search?: string
  dateType?: 'booked' | 'travelling'
  from?: Date
  to?: Date
  status?: BookingStatus
  flightId?: string
  page?: number
  pageSize?: number
}

// One row of My Trips or of the staff Bookings table.
export interface BookingListItem extends BookingSummary {
  leadPassengerName: string
  // For example "BKK → NRT" or "BKK ⇄ NRT".
  trip: string
  // First departure of the booking, used for upcoming/past and the "Travelling" column.
  travelDate: Date | null
  // Last departure of the booking (the return leg); null for a booking without segments.
  travelEndDate: Date | null
  // Passengers on the booking, by type.
  passengerCounts: PassengerCounts
  // The flights of the booking, in segment order (for example ["FL203", "FL204"]).
  flightNumbers: string[]
  // Number of flights on the booking.
  flightCount: number
  openServiceRequests: number
}

// The passengers of a booking, by type (B11).
export interface PassengerCounts {
  adults: number
  children: number
  infants: number
}

// My Trips, split into the Upcoming and Past tabs (B4, B11).
export interface CustomerTrips {
  upcoming: BookingListItem[]
  past: BookingListItem[]
  // The simulation clock's now, so the page can count down a hold without a second request (B11).
  serverNow: Date
}

export interface BookingPage {
  items: BookingListItem[]
  page: number
  pageSize: number
  total: number
}

export interface FlightPassengerDto {
  bookingReference: string
  bookingPassengerId: string
  passengerId: string
  firstName: string
  lastName: string
  passengerType: PassengerType
  cabin: Cabin
  fareClassCode: string | null
  contactEmail: string
  contactPhone: string | null
  seatCode: string | null
  serviceCodes: ServiceCode[]
}

// For Feature 2's impact preview (flightImpactSummary, C7).
export interface FlightBookingCounts {
  bookings: number
  passengers: number
  openServiceRequests: number
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

// B owns the real version (B4, B5). A's staff lookup (B7, B13) and C's providers (C12) and impact summary (C7) read
// through it and never query B's tables directly.
export interface BookingReadPort {
  // For other features (10, 12, 13): no ownership check.
  getBooking: (reference: string) => Promise<BookingDetail | null>
  // Customer and staff routes: a customer gets null for another customer's booking (the route answers 404).
  getBookingDetail: (reference: string, viewer: BookingViewer) => Promise<BookingDetail | null>
  findBookingByReferenceAndSurname: (reference: string, surname: string) => Promise<BookingDetail | null>
  // Feature 6's byBookingPassengerId (C12).
  getBookingForPassenger: (bookingPassengerId: string) => Promise<BookingDetail | null>
  // My Trips (B4/B11).
  listCustomerBookings: (customerId: string) => Promise<BookingListItem[]>
  // Staff Bookings lookup (A's B7 routes).
  listStaffBookings: (query: BookingListQuery) => Promise<BookingPage>
  listFlightPassengers: (flightId: string) => Promise<FlightPassengerDto[]>
  // Feature 7 re-screening.
  listUpcomingFlights: (passengerId: string) => Promise<UpcomingFlightDto[]>
  countBookingsForFlight: (flightId: string) => Promise<FlightBookingCounts>
}

// Mirror of Feature 2's flight_event row and its FlightStatusEvent (PR #27, not on dev yet). Switch to Feature 2's own
// type when PR #27 merges. Feature 3 handles 'flight.created', 'flight.aircraft_changed' and 'flight.cancelled' and
// ignores every other type. On the bus the type has the 'flight.' prefix; the flight_event row stores the bare name
// ('created', 'aircraft_changed', 'cancelled'), so the startup catch-up adds the prefix when it reads rows.
export type HandledFlightEventType = 'flight.created' | 'flight.aircraft_changed' | 'flight.cancelled'

export interface FlightEvent {
  // flight_event.id; flight_event_receipt.event_id points here.
  id: string
  // flight_event.seq: handle events in seq order, never occurred_at (startup catch-up, C7).
  seq: bigint
  flightId: string
  type: string
  occurredAt: Date
  oldAircraftId: string | null
  newAircraftId: string | null
  // flight.cancelled only: 'refund' or 'rebook_partner' decides the coupons' cancel_reason (B14).
  resolution: 'refund' | 'rebook_partner' | null
  // flight.cancelled with rebook_partner: Feature 2's partner_airline code.
  partnerAirline: string | null
}

// B14 sets the booking and coupon statuses only. C7 then releases the seats of these bookings, writes the receipt and
// publishes after commit. Nobody refunds here: Feature 5b refunds from Feature 2's flight.cancelled event by itself.
export interface CancelForFlightResult {
  eventId: string
  affectedBookingIds: string[]
  cancelledCouponIds: string[]
}

export interface CancelForFlightPort {
  cancelBookingsForFlight: (tx: BookingTransaction, flightId: string, event: FlightEvent) => Promise<CancelForFlightResult>
}

export interface FlightEventBus {
  subscribe: (handler: (event: FlightEvent) => Promise<void>) => () => void
  publish: (event: FlightEvent) => Promise<void>
}

// Booking events are published after commit (B1, B6). Feature 13 is the consumer that notifies customers; it finds the
// recipients from the reference or `listFlightPassengers(flightId)`, so the payload stays small. C6 extends the type
// with `service_request.updated` when it publishes.
export type BookingEventType =
  'booking.confirmed' | 'booking.cancelled' | 'booking.partner_rebooked' | 'booking.seat_changed' | 'service_request.updated'

export interface BookingEvent {
  type: BookingEventType
  bookingId: string
  reference: string
  customerId: string
  flightIds: string[]
  occurredAt: Date
  cancelReason?: CouponCancelReason | null
}

export interface BookingEventBus {
  subscribe: (handler: (event: BookingEvent) => Promise<void>) => () => void
  publish: (event: BookingEvent) => Promise<void>
}

// Feature 5a calls confirmBooking and needs the total and hold expiry for its own records. Release has no payment to
// reconcile, so it only reports the new status.
export interface ConfirmBookingResult {
  bookingId: string
  reference: string
  status: 'confirmed'
  total: number
  holdExpiresAt: Date
  confirmedAt: Date
}

export interface ReleaseBookingResult {
  bookingId: string
  reference: string
  status: 'expired'
}
