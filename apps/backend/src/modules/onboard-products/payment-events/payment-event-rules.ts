// What a payment event means for an order.
//
// F5 may deliver the same event more than once, so the decision has to
// be a pure function of (order state, event, now): the same event
// against the same order must always produce the same action, and the
// action must be safe to apply twice.
//
// The four actions:
//   confirm  - the order becomes confirmed and its payment is paid;
//   fail     - the payment failed, so the order is cancelled and the
//              reserved stock is released;
//   refund   - the money arrived too late (the order had expired, or
//              it was already cancelled), so F5 is asked to refund it
//              and the order is expired if it was still pending;
//   ignore   - nothing to do: the event was already applied.

export interface PaymentEventOrderState {
  id: string
  status: string
  expiresAt: Date
  // Stamped when a late payment was accepted for refund. It is the
  // guard that stops a second late event from asking for a second
  // refund.
  paidAt: Date | null
}

export type PaymentEventDecision =
  { action: 'confirm' } | { action: 'fail' } | { action: 'refund'; expireOrder: boolean } | { action: 'ignore' }

export function decidePaymentEvent(state: PaymentEventOrderState, event: { status: 'paid' | 'failed' }, now: Date): PaymentEventDecision {
  if (event.status === 'failed') {
    // A failure only matters while the order is still waiting for the
    // money. Once the order is confirmed the money is there.
    return state.status === 'pending_payment' ? { action: 'fail' } : { action: 'ignore' }
  }

  // The money arrived.
  if (state.status === 'confirmed') return { action: 'ignore' }
  // A late payment was already refunded.
  if (state.paidAt !== null) return { action: 'ignore' }

  if (state.status === 'pending_payment' && now.getTime() <= state.expiresAt.getTime()) {
    return { action: 'confirm' }
  }

  // Too late: the order was expired, cancelled, or the hold ran out.
  return { action: 'refund', expireOrder: state.status === 'pending_payment' }
}
