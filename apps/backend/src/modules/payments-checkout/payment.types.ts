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

/**
 * What a payment row cannot say about itself: who paid, which booking it is for and where the flight stands.
 *
 * The Prisma repository fills it in from `customer`, `user` and the booking tables when it reads a payment. The
 * in-memory repository leaves it out, and the service falls back to `mock-booking-state.ts`, so the mock and the real
 * rows go through the same code.
 */
export interface PaymentContext {
  customer_name: string | null
  customer_email: string | null
  /** The booking reference the customer reads. Without a booking row it is the purchase reference. */
  booking_reference: string | null
  route: string | null
  flight_number: string | null
  flight_date: string | null
  /** The flight has already gone, so a refund needs a person to decide. */
  flown: boolean
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
  /**
   * When the selling feature confirmed the purchase.
   *
   * The schema has no column for this: the confirmation belongs to the booking (Feature 3b owns it), but the staff
   * frames show it in the payment's state history, so the mock keeps it on the row.
   *
   * TODO(F5a): the Database Team decides — either a `payment.confirmed_at` column, or the state history reads the
   * booking's confirmation time from Feature 3b.
   */
  confirmed_at: Date | null
  captured_at: Date | null
  voided_at: Date | null
  capture_stalled_at: Date | null
  created_at: Date
  updated_at: Date
  lines: PaymentLineRecord[]
  attempts: PaymentAttemptRecord[]
  /** Set by the Prisma repository when it reads the row; see `PaymentContext`. */
  context?: PaymentContext
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

/** How a staff member closed an exception. `posted` = the payment reached the finance ledger. */
export type PaymentExceptionResolution = 'captured' | 'voided' | 'expired' | 'posted'

/**
 * The kinds of problem the staff "Payment exceptions" page lists.
 *
 * The frames' list is a list of *problems*, not a list of payments: one row says what went wrong, which reference it
 * belongs to, and what a staff member can do about it. Feature 5c's "Crew payout failed" is not here — that is 5c's
 * row, on the same page.
 */
export const PAYMENT_PROBLEM_TYPES = [
  'ticket_capture_stalled',
  'cargo_capture_stalled',
  'waiting_for_provider',
  'finance_posting_delayed',
  'authorisation_voided',
] as const
export type PaymentProblemType = (typeof PAYMENT_PROBLEM_TYPES)[number]

/** What a staff member can do about a problem, if anything. */
export const PAYMENT_PROBLEM_ACTIONS = ['retry_capture', 'send_posting', 'none'] as const
export type PaymentProblemAction = (typeof PAYMENT_PROBLEM_ACTIONS)[number]
