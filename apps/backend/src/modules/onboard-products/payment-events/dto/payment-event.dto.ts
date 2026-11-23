// The payment event F5 posts to /payment-events.
//
// F5 owns the payment, so it tells F12 which order it belongs to and
// whether the money arrived. The order is identified by the reference
// F12 sent when it started the payment (the product_order id) and/or
// by the payment id F5 returned.

import { ApiErrorException } from '../../common/api-error'

export type PaymentEventStatus = 'paid' | 'failed'

export interface PaymentEventInput {
  // The product_order id F12 sent as the payment reference.
  reference: string
  paymentId: string | null
  status: PaymentEventStatus
  amount: number | null
  currency: string | null
}

export function parsePaymentEvent(body: unknown): PaymentEventInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('VALIDATION_ERROR', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const reference = firstString(b.reference, b.orderId, b.order_id)
  if (!reference) {
    throw new ApiErrorException('VALIDATION_ERROR', 'reference is required.', 400)
  }
  const rawStatus = firstString(b.status, b.state, b.result)?.toLowerCase()
  if (rawStatus !== 'paid' && rawStatus !== 'failed') {
    throw new ApiErrorException('VALIDATION_ERROR', 'status must be paid or failed.', 400)
  }
  const amount = typeof b.amount === 'number' && Number.isFinite(b.amount) ? b.amount : null
  const currency = typeof b.currency === 'string' && b.currency.length > 0 ? b.currency.toUpperCase() : null
  return {
    reference,
    paymentId: firstString(b.paymentId, b.payment_id),
    status: rawStatus,
    amount,
    currency,
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
