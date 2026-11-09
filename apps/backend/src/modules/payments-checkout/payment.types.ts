/**
 * Feature 5a's payment vocabulary and the shapes of the rows it keeps.
 *
 * Every constant here mirrors a CHECK constraint in the Payments section of `apps/backend/src/db/schema.sql`, and every
 * field name mirrors the column name. The Database Team owns that file, so a constraint change and the matching array
 * here land in the same PR. Mirroring exactly is the point: the mock's rows can be read back as if Prisma had
 * returned them, and the real implementation only has to swap the repository.
 *
 * TODO(F5a): money is a JS number rounded to two decimals here. The real implementation uses Prisma `Decimal`
 * (NUMERIC(12, 2)); only a Stripe provider converts to minor units.
 */

/** Mirrors the `payment.status` CHECK. */
export const PAYMENT_STATUSES = ['created', 'authorised', 'captured', 'failed', 'voided', 'expired', 'reversed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Mirrors the `payment.provider` CHECK. `none` = nothing was charged on a card (a zero-cash award booking). */
export const PAYMENT_PROVIDERS = ['stripe', 'fake', 'none'] as const
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

/** Mirrors the `payment.source_feature` CHECK — the selling feature that owns the purchase. */
export const PAYMENT_SOURCE_FEATURES = [3, 6, 12, 17] as const
export type PaymentSourceFeature = (typeof PAYMENT_SOURCE_FEATURES)[number]

/** Mirrors the `payment_line.line_type` CHECK. */
export const PAYMENT_LINE_TYPES = [
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
export type PaymentLineType = (typeof PAYMENT_LINE_TYPES)[number]

/** Mirrors the `receipt.document_type` CHECK. */
export const RECEIPT_DOCUMENT_TYPES = ['receipt', 'invoice', 'credit_note'] as const
export type ReceiptDocumentType = (typeof RECEIPT_DOCUMENT_TYPES)[number]

/** Mirrors `payment_attempt.status` CHECK. */
export const PAYMENT_ATTEMPT_STATUSES = ['open', 'authorised', 'failed', 'expired', 'cancelled'] as const
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number]

/** One `payment_line` row. */
export interface PaymentLineRecord {
  id: string
  payment_id: string
  booking_id: string | null
  booking_coupon_id: string | null
  line_type: PaymentLineType
  source_ref: string | null
  description: string
  amount: number
  refunded_amount: number
  created_at: Date
}

/** One `payment_attempt` row — one checkout session on the provider's side. */
export interface PaymentAttemptRecord {
  id: string
  payment_id: string
  provider_session_id: string
  provider_intent_id: string | null
  status: PaymentAttemptStatus
  failure_code: string | null
  card_brand: string | null
  card_last4: string | null
  created_at: Date
  updated_at: Date
}

/** One `receipt` row. */
export interface ReceiptRecord {
  id: string
  payment_id: string
  refund_id: string | null
  document_type: ReceiptDocumentType
  document_number: string
  amount: number
  billing_name: string | null
  issued_at: Date
  created_at: Date
}

/** One `payment` row, with its lines and attempts attached. */
export interface PaymentRecord {
  id: string
  source_feature: PaymentSourceFeature
  purchase_ref: string
  payer_customer_id: string | null
  booking_id: string | null
  cargo_booking_id: string | null
  voucher_id: string | null
  idempotency_key: string
  status: PaymentStatus
  provider: PaymentProvider
  currency: string
  amount_total: number
  voucher_amount: number
  card_amount: number
  provider_fee: number | null
  capture_attempts: number
  last_error: string | null
  started_at: Date
  expires_at: Date
  authorised_at: Date | null
  captured_at: Date | null
  voided_at: Date | null
  capture_stalled_at: Date | null
  created_at: Date
  updated_at: Date
  lines: PaymentLineRecord[]
  attempts: PaymentAttemptRecord[]
}

/**
 * The staff exception list has no backing table in the schema — `payment` carries the stall flag but nothing records
 * who resolved it. 5a keeps the resolution in memory for the mock and reports the gap to the Database Team.
 */
export interface PaymentExceptionRecord {
  payment_id: string
  state: PaymentExceptionState
  detected_at: Date
  resolved_at: Date | null
  resolved_by: string | null
  resolution: PaymentExceptionResolution | null
  note: string | null
}

/** The three tabs of the staff "Payment exceptions" page, plus the "all" view. */
export const PAYMENT_EXCEPTION_STATES = ['needs_action', 'queued', 'resolved'] as const
export type PaymentExceptionState = (typeof PAYMENT_EXCEPTION_STATES)[number]

/** How a staff member closed an exception. */
export type PaymentExceptionResolution = 'captured' | 'voided' | 'expired'
