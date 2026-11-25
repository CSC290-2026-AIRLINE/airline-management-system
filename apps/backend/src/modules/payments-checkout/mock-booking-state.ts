import type { RefundState } from './dto/payments-checkout.types'

/**
 * The mock data the payment rows cannot hold on their own.
 *
 * A receipt says whether it can be refunded and which booking it belongs to, but neither of those lives on the
 * `payment` or `receipt` row: the refundable state is the booking's (Feature 3b), the flown state is the flight's, and
 * the miles came from Feature 11's redeem rows. Until those features expose them, the mock keeps small maps here.
 *
 * TODO(F5a): replace these maps with Feature 3b's booking lookup and Feature 11's redeem rows. The "flown, ask staff"
 * case needs the flight's flown state as well, which 3b owns.
 */

/** The demo customer the seeded payments belong to. */
export const DEMO_CUSTOMER_ID = 'c0000000-0000-4000-8000-0000000000c1'
/** The Clerk user id that resolves to the demo customer. */
export const DEMO_USER_ID = 'user_demo_customer'

/** The customers the mock knows about, keyed by `customer.id`. */
export const MOCK_CUSTOMERS: Record<string, { id: string; name: string; email: string }> = {
  [DEMO_CUSTOMER_ID]: { id: DEMO_CUSTOMER_ID, name: 'Demo Customer', email: 'demo.customer@flython.aero' },
}

/** The booking reference shown on a receipt, keyed by `payment.booking_id`. */
export const MOCK_BOOKING_REFERENCE: Record<string, string> = {
  bk_7f3a91: 'FLY3AB',
  bk_2a44c0: 'FLY2CD',
  bk_0b12c3: 'FLY0BC',
  bk_3e5f44: 'FLY3EF',
  bk_5c8e21: 'FLY5EF',
  bk_6f1d99: 'FLY8LA',
  bk_1d7c40: 'FLY1GH',
  bk_2c8f55: 'FLY2GH',
  bk_4e1d92: 'FLY4GH',
  bk_6b0a44: 'FLY6GH',
}

/** The cargo reference shown on a cargo invoice, keyed by `payment.cargo_booking_id`. */
export const MOCK_CARGO_REFERENCE: Record<string, string> = {
  cb_9d10ff: 'CGO-9D10FF',
  cb_3a77c1: 'CGO-3A77C1',
}

/**
 * The flight behind a booking.
 *
 * The receipts list shows the route, the flight number and the day, and none of them live on the payment row — they
 * are the booking's (Feature 3b).
 *
 * TODO(F5a): read these from Feature 3b's booking and its flights.
 */
export interface MockFlight {
  route: string
  flight_number: string
  flight_date: string
}

export const MOCK_BOOKING_FLIGHT: Record<string, MockFlight> = {
  bk_7f3a91: { route: 'BKK → CNX', flight_number: 'FY102', flight_date: '2026-10-12' },
  bk_2a44c0: { route: 'BKK → HKT', flight_number: 'FY205', flight_date: '2026-10-14' },
  bk_0b12c3: { route: 'BKK → CNX', flight_number: 'FY102', flight_date: '2026-10-12' },
  bk_3e5f44: { route: 'BKK → SIN', flight_number: 'FY310', flight_date: '2026-10-20' },
  bk_5c8e21: { route: 'BKK → MIA', flight_number: 'FY088', flight_date: '2026-10-20' },
  bk_6f1d99: { route: 'BKK → LAX', flight_number: 'FY121', flight_date: '2026-11-02' },
  bk_1d7c40: { route: 'BKK → DEN', flight_number: 'FY077', flight_date: '2026-11-14' },
  bk_2c8f55: { route: 'BKK → KIX', flight_number: 'FY204', flight_date: '2026-11-18' },
  bk_4e1d92: { route: 'BKK → SGN', flight_number: 'FY318', flight_date: '2026-11-21' },
  bk_6b0a44: { route: 'BKK → DMK', flight_number: 'FY061', flight_date: '2026-11-04' },
}

/**
 * How each seeded booking may be treated when the customer asks for a refund.
 *
 * - `refundable` — inside the fare rule's window, 5b would accept a request.
 * - `not_refundable` — a non-refundable fare, or the payment was already reversed; the receipt says so and the button
 *   is gone.
 * - `ask_staff` — the flight has already gone, so a human has to decide.
 */
export const MOCK_BOOKING_REFUND_STATE: Record<string, RefundState> = {
  bk_7f3a91: 'ask_staff',
  bk_2a44c0: 'refundable',
  bk_0b12c3: 'refundable',
  bk_3e5f44: 'not_refundable',
  bk_5c8e21: 'refundable',
  bk_6f1d99: 'not_refundable',
  bk_2c8f55: 'refundable',
  bk_4e1d92: 'refundable',
  bk_6b0a44: 'not_refundable',
}

/**
 * Whether the flight behind a booking has already gone.
 *
 * A receipt shows "Flown" once the flight has departed, and a flown booking's refund has to be looked at by a person
 * (Feature 5b) rather than by the customer.
 *
 * TODO(F5a): read the flight's flown state from Feature 3b.
 */
export const MOCK_BOOKING_FLOWN: Record<string, boolean> = {
  bk_7f3a91: true,
  bk_2a44c0: false,
  bk_0b12c3: false,
  bk_3e5f44: false,
  bk_5c8e21: false,
  bk_6f1d99: true,
  bk_2c8f55: false,
  bk_4e1d92: false,
  bk_6b0a44: true,
}

/**
 * The miles a booking was redeemed with, keyed by `payment.booking_id`.
 *
 * Miles are not money: the `payment` row only carries the cash that was charged (`amount_total` = `card_amount` when
 * no compensation voucher is involved). The receipt shows the miles next to the cash.
 *
 * TODO(F5a): read these from Feature 11's redeem rows (`loyalty_benefit_use`).
 */
export const MOCK_MILES_REDEEMED: Record<string, number> = {
  bk_2a44c0: 40000,
  bk_0b12c3: 25000,
}

/**
 * Resolves a signed-in user id to a `customer.id`.
 *
 * TODO(F5a): replace with the real lookup — `customer` where `user_id` = the token's `sub`. The token carries no user
 * type, so this cannot tell a customer from a staff member; the staff routes are separated by path instead.
 */
export function resolveCustomerId(userId: string): string {
  if (userId === DEMO_USER_ID) return DEMO_CUSTOMER_ID
  return userId
}

/** The customer's display name, when the mock knows them. */
export function customerName(customerId: string | null): string | null {
  if (!customerId) return null
  return MOCK_CUSTOMERS[customerId]?.name ?? null
}

/** The customer's email address, when the mock knows them. The staff lookup shows it. */
export function customerEmail(customerId: string | null): string | null {
  if (!customerId) return null
  return MOCK_CUSTOMERS[customerId]?.email ?? null
}

/** The flight behind a booking, when the mock knows it. */
export function bookingFlight(bookingId: string | null): MockFlight | null {
  if (!bookingId) return null
  return MOCK_BOOKING_FLIGHT[bookingId] ?? null
}
