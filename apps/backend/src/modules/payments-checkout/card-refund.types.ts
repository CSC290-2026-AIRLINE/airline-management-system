/**
 * What Feature 5b and Feature 5a say to each other about a refund to the card.
 *
 * 5b decides a refund and owns its row; 5a owns the payment, the provider and the documents. 5b asks 5a to send the money
 * back (`refundToCard`), tells 5a how it ended (`recordRefundSucceeded`, `recordRefundFailed`), and hears from 5a when the
 * provider settles a refund later, through its webhook (`RefundSettler`). These are the types of that conversation.
 */

/** 5b asks for money to go back to the card that paid. */
export interface CardRefundRequest {
  payment_id: string
  /** 5b's refund row. It makes the provider call safe to repeat: the same refund is never refunded twice. */
  refund_id: string
  amount: number
}

/** What the provider said, in 5a's words. `pending` means a webhook will say how it ended. */
export interface CardRefundOutcome {
  status: 'succeeded' | 'pending' | 'failed'
  provider_refund_id: string | null
  failure_code: string | null
}

/** 5b tells 5a a card refund went through, so 5a issues the credit note and, when nothing is left, reverses the payment. */
export interface RefundSucceededRequest {
  payment_id: string
  refund_id: string
  amount: number
  /** Every line of the payment is now refunded, so the payment moves from `captured` to `reversed`. */
  fully_refunded: boolean
}

/** The provider's late word on a refund (a webhook): it succeeded, or it failed. */
export interface RefundSettlement {
  refund_id: string
  provider_refund_id: string | null
  outcome: 'succeeded' | 'failed'
  failure_code: string | null
}

/** What 5b registers with 5a to hear about the provider's late word. */
export type RefundSettler = (settlement: RefundSettlement) => Promise<void>
