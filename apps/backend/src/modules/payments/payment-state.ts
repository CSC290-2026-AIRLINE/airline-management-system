export const PAYMENT_STATUSES = ['created', 'authorised', 'captured', 'failed', 'voided', 'expired', 'reversed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Statuses that hold the purchase (the partial unique index `payment_one_live_per_purchase_uq`). */
export const LIVE_STATUSES: readonly PaymentStatus[] = ['created', 'authorised', 'captured', 'reversed']

/**
 * Every move a payment may make. A payment only moves forward; `reversed -> captured` (a refund that fails late) is the
 * one way back. Anything not listed is ignored, which is how a duplicate or out-of-order webhook is made harmless.
 */
const MOVES: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['authorised', 'captured', 'failed', 'expired'],
  authorised: ['captured', 'voided'],
  captured: ['reversed'],
  reversed: ['captured'],
  failed: [],
  voided: [],
  expired: [],
}

export function canMove(from: string, to: PaymentStatus): boolean {
  return (MOVES[from as PaymentStatus] ?? []).includes(to)
}

export const REFUND_STATUSES = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

/** Refunds whose lines still count against what a payment line can refund. */
export const LIVE_REFUND_STATUSES: readonly RefundStatus[] = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded']

export const REFUND_REASONS = [
  'customer_cancel',
  'flight_cancelled',
  'rebook_difference',
  'customer_request',
  'staff_adjustment',
  'compensation',
  'cargo_cancel',
  'cargo_rejected',
  'cargo_reweigh',
] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

export const LINE_TYPES = [
  'fare',
  'award_fee',
  'seat_fee',
  'baggage',
  'upgrade',
  'onboard_order',
  'insurance',
  'cargo_freight',
  'cargo_surcharge',
] as const
export type LineType = (typeof LINE_TYPES)[number]
