/**
 * The shapes Feature 5a's staff API returns.
 *
 * These mirror `apps/backend/src/modules/payments-checkout/dto/payments-checkout.types.ts` one for one, so the mock data
 * below can be swapped for a real response without touching a component.
 *
 * TODO(F5a): delete this file and import the response types from the backend's OpenAPI/contract once the API is live.
 */

/** The payment statuses the `payment` table allows. */
export type PaymentStatus = 'created' | 'authorised' | 'captured' | 'failed' | 'voided' | 'expired' | 'reversed'

/** The selling features that can start a payment: 3 (booking), 6 (excess baggage), 12 (onboard sale), 17 (cargo). */
export type PaymentSourceFeature = 3 | 6 | 12 | 17

/**
 * The staff lookup's status filters.
 *
 * These are screen labels, not database statuses: `capture_stalled` is `capture_stalled_at IS NOT NULL` and `refunded`
 * is the `reversed` status.
 */
export const STAFF_PAYMENT_FILTERS = ['captured', 'failed', 'capture_stalled', 'voided', 'refunded'] as const
export type StaffPaymentFilter = (typeof STAFF_PAYMENT_FILTERS)[number]

/** The exception list's tabs. */
export const PAYMENT_EXCEPTION_TABS = ['needs_action', 'queued', 'resolved', 'all'] as const
export type PaymentExceptionTab = (typeof PAYMENT_EXCEPTION_TABS)[number]

/** Where a payment sits on the exception list. */
export type PaymentExceptionState = 'needs_action' | 'queued' | 'resolved'

/**
 * The kinds of problem the staff "Payment exceptions" page lists.
 *
 * The frames' list is a list of *problems*, not a list of payments. Feature 5c's "Crew payout failed" belongs to the
 * same page in the frames, but it is 5c's row and 5a does not raise it.
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

/** One line on a payment. */
export interface PaymentLineDto {
  line_type: string
  description: string
  amount: number
}

/** One row of the staff payment lookup. */
export interface StaffPaymentSummaryDto {
  id: string
  /** The human-readable reference, e.g. `PAY-20261104-0042`. */
  reference: string
  purchase_ref: string
  source_feature: PaymentSourceFeature
  source_feature_label: string
  status: PaymentStatus
  status_label: string
  payer_customer_id: string | null
  customer_name: string | null
  customer_email: string | null
  /** The booking reference (PNR) behind the payment, when there is one. */
  booking_reference: string | null
  /** What the customer paid with, in words: "Card ending 4242", "24,000 miles + card". */
  paid_with: string
  card_brand: string | null
  card_last4: string | null
  miles_redeemed: number | null
  amount_total: number
  voucher_amount: number
  card_amount: number
  currency: string
  started_at: string
  expires_at: string
  captured_at: string | null
  capture_stalled_at: string | null
  last_error: string | null
  receipt_id: string | null
  /** When the payment last moved — the time the lookup shows under the reference. */
  updated_at: string
}

/** One step of the state history the payment detail shows. */
export interface PaymentStateStepDto {
  key: string
  label: string
  at: string | null
}

/** The staff payment detail, with the state history the frames show. */
export interface StaffPaymentDetailDto extends StaffPaymentSummaryDto {
  idempotency_key: string
  provider: string
  provider_fee: number | null
  capture_attempts: number
  authorised_at: string | null
  voided_at: string | null
  /** The provider's id for the payment, e.g. `pi_3Q…x9A`. Null until the real provider is connected. */
  provider_reference: string | null
  /** The flight the payment is for, e.g. `FY214 YGN → BKK`. Null for a purchase that is not a flight. */
  trip: string | null
  /** The refund opened against this payment, e.g. `REF-0121`. Feature 5b owns it; null until then. */
  refund_reference: string | null
  lines: PaymentLineDto[]
  /** The steps the payment went through, oldest first. */
  state_history: PaymentStateStepDto[]
  exception: {
    state: PaymentExceptionState
    detected_at: string
    resolved_at: string | null
    resolved_by: string | null
    resolution: string | null
    note: string | null
  } | null
}

/**
 * One row of the staff "Payment exceptions" page.
 *
 * The frames' list is a list of problems: each row says what went wrong, which reference it belongs to, when it
 * started, and what a staff member can do about it.
 */
export interface PaymentProblemDto {
  id: string
  type: PaymentProblemType
  /** The headline, e.g. "Ticket capture stalled". */
  title: string
  /** The reference the row is about, e.g. `PAY-20261103-0027`. */
  reference: string
  /** The booking behind it, when there is one. */
  booking_reference: string | null
  /** "What happened" — one sentence, in the words the frames use. */
  what_happened: string
  /** "What to do" — the recommended action, in words. */
  what_to_do: string
  /** The action the row's button offers, if any. */
  action: PaymentProblemAction
  /** The button's label, so the wording lives with the problem, not with the screen. */
  action_label: string | null
  /** When the problem started. */
  since: string
  state: PaymentExceptionState
  /** The payment behind the problem, when there is one. */
  payment_id: string | null
}

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
}

/** The staff lookup's list, with the counts the frames show on the filter chips. */
export interface StaffPaymentListDto extends ListDto<StaffPaymentSummaryDto> {
  counts: Record<'all' | StaffPaymentFilter, number>
}

/** The staff exception list, with the counts the frames show on the tabs. */
export interface PaymentProblemListDto extends ListDto<PaymentProblemDto> {
  counts: Record<PaymentExceptionState | 'all', number>
}
