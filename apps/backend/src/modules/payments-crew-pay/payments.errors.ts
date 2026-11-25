// Error codes Feature 5 owns. Every error body is { error: { code, message, details? } }, as in the other modules.
export const PaymentErrorCode = {
  HOLD_TOO_SHORT: 'HOLD_TOO_SHORT',
  PAYMENT_NOT_PAYABLE: 'PAYMENT_NOT_PAYABLE',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  VOUCHER_INVALID: 'VOUCHER_INVALID',
  REFUND_EXCEEDS_PAID: 'REFUND_EXCEEDS_PAID',
  REFUND_NEEDS_APPROVAL: 'REFUND_NEEDS_APPROVAL',
  REFUND_NOT_FOUND: 'REFUND_NOT_FOUND',
  REFUND_NOT_ACTIONABLE: 'REFUND_NOT_ACTIONABLE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
  CARGO_NOT_PAYABLE: 'CARGO_NOT_PAYABLE',
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  STAFF_ONLY: 'STAFF_ONLY',
  ADMIN_ONLY: 'ADMIN_ONLY',
  COMPENSATION_NOT_PAYABLE: 'COMPENSATION_NOT_PAYABLE',
  // Crew pay (5c, stretch)
  PAY_RUN_NOT_FOUND: 'PAY_RUN_NOT_FOUND',
  PAY_RUN_NOT_APPROVABLE: 'PAY_RUN_NOT_APPROVABLE',
  PAY_RUN_SELF_APPROVAL: 'PAY_RUN_SELF_APPROVAL',
  PAYROLL_LINE_LOCKED: 'PAYROLL_LINE_LOCKED',
  FINANCE_ONLY: 'FINANCE_ONLY',
  CREW_NOT_LINKED: 'CREW_NOT_LINKED',
} as const
export type PaymentErrorCode = (typeof PaymentErrorCode)[keyof typeof PaymentErrorCode]

/**
 * A Feature 5 failure for the spec's error body, `{ error: { code, message, details? } }`. It also carries a top-level
 * `message`, which Nest reads for `exception.message` and which the two web apps already show.
 */
export function paymentFailure(code: PaymentErrorCode, message: string, details?: Record<string, unknown>) {
  return { message, ...paymentError(code, message, details) }
}

export function paymentError(code: PaymentErrorCode, message: string, details?: Record<string, unknown>) {
  return { error: { code, message, ...(details && { details }) } }
}

/** Prisma P2002 (unique violation), checked by code so services never load the generated Prisma runtime under Jest. */
export function isUniqueViolation(error: unknown, indexName?: string): boolean {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002') return false
  if (!indexName) return true
  // The violated constraint is named in meta.target (an index name or a column list) or, failing that, the message.
  const meta = (error as { meta?: { target?: unknown; constraint?: unknown } }).meta
  const text = JSON.stringify(meta ?? {}) + error.message
  return text.includes(indexName)
}
