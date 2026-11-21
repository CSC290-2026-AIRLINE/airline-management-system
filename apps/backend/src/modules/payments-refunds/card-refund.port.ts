import type { CardRefundOutcome, CardRefundRequest, RefundSucceededRequest } from '@backend/modules/payments-checkout/card-refund.types'

/** The DI token for the way a refund reaches the card. */
export const CARD_REFUND_PORT = 'CARD_REFUND_PORT'

/**
 * What Feature 5b needs from Feature 5a to pay a refund back to the card: `PaymentsCheckoutService` provides it.
 *
 * It is a port so the unit tests need no provider, and so 5b runs without 5a's provider at all (a refund then stays
 * "Paying to card" until something settles it, which is how the module behaved before Stripe).
 */
export interface CardRefundPort {
  /** Sends the money to the provider. Never throws: a failure is an outcome with a code. */
  refundToCard: (request: CardRefundRequest) => Promise<CardRefundOutcome>
  /** Issues the credit note of a refund that went through, and reverses the payment when nothing is left on it. */
  recordRefundSucceeded: (request: RefundSucceededRequest) => Promise<{ credit_note_number: string }>
  /** A refund that was counted as through did not go through after all. */
  recordRefundFailed: (paymentId: string) => Promise<void>
}
