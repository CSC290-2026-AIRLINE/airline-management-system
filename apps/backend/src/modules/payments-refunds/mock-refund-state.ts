import type { MockBooking } from './refund.types'

/**
 * The mock data the refund rows cannot hold on their own.
 *
 * A refund names a payment, and the payment names a booking and a customer. Those belong to Feature 5a and Feature 3b.
 * Until they are read for real, the mock keeps small maps here.
 *
 * TODO(F5b): replace these maps with Feature 5a's `payment` and Feature 3b's booking lookup, and the customer with the
 * signed-in user's `customer` row.
 */

/** The demo customer every mock refund and voucher belongs to. */
export const DEMO_CUSTOMER_ID = 'c0000000-0000-4000-8000-0000000000c1'

/** The one customer the mock knows. Any signed-in user reads the demo customer's refunds until `customer` is read. */
export function resolveCustomerId(userId: string): string {
  void userId
  return DEMO_CUSTOMER_ID
}

/** Another customer, so the queue holds requests that are not the demo customer's. */
export const OTHER_CUSTOMER_ID = 'c0000000-0000-4000-8000-0000000000c2'

function booking(reference: string, paymentNumber: string, brand: string, last4: string, customerId = DEMO_CUSTOMER_ID): MockBooking {
  return {
    reference,
    customer_id: customerId,
    payment_id: `pay_00000000-0000-4000-8000-00000000${paymentNumber}`,
    card_brand: brand,
    card_last4: last4,
  }
}

/** The bookings the frames name, keyed by their reference. */
export const MOCK_BOOKINGS: Record<string, MockBooking> = {
  K7QF2M: booking('K7QF2M', '0042', 'Visa', '4242'),
  R5NH7C: booking('R5NH7C', '0038', 'Visa', '4242', OTHER_CUSTOMER_ID),
  T9WE2L: booking('T9WE2L', '0045', 'Visa', '4242', OTHER_CUSTOMER_ID),
  Q2LV8R: booking('Q2LV8R', '0017', 'Visa', '4242'),
  M3XP9D: booking('M3XP9D', '0031', 'Visa', '4242'),
  H2JD6A: booking('H2JD6A', '0033', 'Visa', '1881'),
  F6RW9K: booking('F6RW9K', '0021', 'Visa', '7310'),
  B8TN4W: booking('B8TN4W', '0019', 'Visa', '4242'),
  W4NB8T: booking('W4NB8T', '0044', 'Visa', '4242'),
}
