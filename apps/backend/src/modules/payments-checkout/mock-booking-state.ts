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
export const MOCK_CUSTOMERS: Record<string, { id: string; name: string }> = {
  [DEMO_CUSTOMER_ID]: { id: DEMO_CUSTOMER_ID, name: 'Demo Customer' },
}

/** The booking reference shown on a receipt, keyed by `payment.booking_id`. */
export const MOCK_BOOKING_REFERENCE: Record<string, string> = {
  bk_7f3a91: 'FLY3AB',
  bk_2a44c0: 'FLY2CD',
  bk_0b12c3: 'FLY0BC',
  bk_3e5f44: 'FLY3EF',
  bk_5c8e21: 'FLY5EF',
  bk_6f1d99: 'FLY6GH',
  bk_1d7c40: 'FLY1GH',
}

/** The cargo reference shown on a cargo invoice, keyed by `payment.cargo_booking_id`. */
export const MOCK_CARGO_REFERENCE: Record<string, string> = {
  cb_9d10ff: 'CGO-9D10FF',
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
  bk_7f3a91: 'not_refundable',
  bk_2a44c0: 'ask_staff',
  bk_0b12c3: 'ask_staff',
  bk_3e5f44: 'not_refundable',
  bk_5c8e21: 'refundable',
  bk_6f1d99: 'refundable',
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
