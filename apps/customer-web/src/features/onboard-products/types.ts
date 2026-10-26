// Type contracts for Feature 12 — Onboard Products (customer-web).
//
// These shapes mirror the Prisma schema in apps/backend/src/db/prisma/schema.prisma
// (models `flight`, `passenger`, `product_order`, `product_order_line`,
// `cabin_setting`). The exact F3b booking response shape is a working
// assumption — the F3b team owns `GET /api/bookings/:id`. If the response
// shape differs, adjust these types first, then the page will surface the
// mismatch at the runtime boundary in `api.ts`.
//
// Conventions:
// - All timestamps are ISO 8601 strings in UTC.
// - All money amounts are in major units (e.g. dollars, not cents).
// - `null` is used for "explicitly absent" (e.g. no passenger assigned);
//   `undefined` is not allowed across the API boundary.

export type ProductCategory = 'meal' | 'snack' | 'beverage' | 'duty_free'

export type ProductOrderStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired' | 'void'

export type PriceBasis = 'standard' | 'tier_benefit' | 'included'

export type CabinClass = 'economy' | 'business' | 'first'

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed'

export type TripType = 'one_way' | 'round_trip'

export type PassengerType = 'adult' | 'child' | 'infant'

export interface AirportRef {
  code: string // IATA, e.g. "BKK"
  city: string // display name, e.g. "Bangkok"
}

export interface PassengerRef {
  id: string
  firstName: string
  lastName: string
  type: PassengerType
  isAccountHolder: boolean
}

export interface FlightRef {
  id: string
  flightNumber: string // e.g. "FY308"
  origin: AirportRef
  destination: AirportRef
  scheduledDeparture: string // ISO
  cabinClass: CabinClass
  seatNumbers: string[]
  // The server-stamped ordering deadline. If the API omits this, the page
  // falls back to `scheduledDeparture - 48h` (the spec default for
  // `cabin_setting.order_window_hours`).
  cutoffAt: string | null
}

export interface Booking {
  id: string
  reference: string // e.g. "FLY7K2"
  status: BookingStatus
  passengers: PassengerRef[]
  flights: FlightRef[]
  totalPassengers: number
  tripType: TripType
  routeSummary: string // e.g. "Bangkok to Tokyo"
}

export interface ProductOrderLine {
  id: string
  productId: string
  productName: string
  category: ProductCategory
  quantity: number
  unitPrice: number
  priceBasis: PriceBasis
  // For meal lines, the passenger this meal is for. Null for snacks / drinks /
  // duty-free, which are not passenger-scoped.
  passengerId: string | null
  // Free-text note shown under the product name. Used by the duty-free flow
  // to show "Collect on board". Null for lines without a note.
  fulfillmentNote: string | null
  // Pre-computed line total = quantity * unitPrice (server-side).
  lineTotal: number
}

export interface ProductOrder {
  id: string
  bookingId: string
  flightId: string
  // Display fields for the order header. Duplicated so the orders list can
  // render without a second fetch into the booking.
  flightNumber: string
  flightOriginCode: string
  flightDestinationCode: string
  placedAt: string
  // Per-order deadline. Derived server-side from the flight's
  // `order_window_hours` at the time the order was created.
  changesAllowedUntil: string
  status: ProductOrderStatus
  paidAt: string | null
  cancelledAt: string | null
  refundRequestedAt: string | null
  // Server-assigned refund reference id (e.g. "RF-3001"). Set when the
  // customer requests a refund (i.e. `refundRequestedAt` is non-null).
  // Null while the order is active or in any other state. Surfaced in
  // the order card's "Refund request RF-XXXX" notice.
  refundId: string | null
  totalAmount: number
  currency: string // ISO 4217, e.g. "USD"
  lines: ProductOrderLine[]
}

export interface ApiErrorPayload {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// --- Page 2 / shop ----------------------------------------------------

// A single product offering for a flight. The server is the source of
// truth for which products are available on which flight; the catalog
// endpoint should reflect the F12 rules (cabin setting, stock, schedule).
export interface Product {
  id: string
  category: ProductCategory
  // IATA special-meal code, e.g. "VGML", "MOML", "KSML", "DBML", "GFML".
  // Null for products that don't carry a code.
  typeCode: string | null
  name: string
  description: string
  unitPrice: number // major units, e.g. 24.00
  isPremium: boolean
  // Background color used when no image is available. Filled behind the
  // illustration in the 48×48 thumb, or shown alone when `imageUrl` is null.
  thumbnailColor: string
  // Public path to the Figma illustration (e.g. "/products/braised-beef.svg").
  // Null when only the placeholder color is available.
  imageUrl: string | null
  // True only for the "Default meal" pseudo-product that means
  // "no pre-order, serve whatever the cabin has".
  isDefaultChoice: boolean
}

// Cabin's meal policy for a flight. Mirrors the `cabin_setting` row in
// the Prisma schema. The shop renders a strip of copy and uses
// `mealService` to compute free / paid / hidden pricing.
export type MealService = 'complimentary' | 'paid' | 'none'
export type MealSelection = 'choose' | 'fixed'

export interface CabinSetting {
  flightId: string
  cabin: CabinClass
  mealService: MealService
  mealSelection: MealSelection
  includedPerPassenger: 0 | 1
  preorderEnabled: boolean
  orderWindowHours: number
  premiumMealsAllowed: boolean
  snacksEnabled: boolean
  dutyFreeEnabled: boolean
}

// A line in the in-memory cart. The page builds the cart from a flat
// list of lines keyed by passenger; a passenger without any entries
// is on the cabin's default meal (no order line is created on submit).
export interface CartLine {
  productId: string
  productName: string
  category: ProductCategory
  quantity: number
  unitPrice: number
  priceBasis: PriceBasis
}

// The cart is keyed by passengerId. Each passenger has an array of
// lines across all categories (a meal line + any snacks/drinks/duty-free
// lines). A passenger without an entry has no selections. For meal
// lines, `quantity` is always 1 (meals are single-choice per passenger).
export type Cart = Record<string, CartLine[]>

export type CategoryTab = 'meals' | 'snacks' | 'duty-free'

// Payload for POST /api/product-orders.
export interface PlaceOrderPayload {
  bookingId: string
  flightId: string
  // Already-priced lines (priceBasis + unitPrice resolved server-side).
  // The mock also accepts them from the client.
  lines: Array<{
    productId: string
    category: ProductCategory
    passengerId: string
    quantity: number
    unitPrice: number
    priceBasis: PriceBasis
  }>
}
