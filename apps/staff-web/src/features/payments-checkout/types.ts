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

/** One line on a payment. */
export interface PaymentLineDto {
  line_type: string
  description: string
  amount: number
}

/** One row of the staff payment lookup. */
export interface StaffPaymentSummaryDto {
  id: string
  purchase_ref: string
  source_feature: PaymentSourceFeature
  source_feature_label: string
  status: PaymentStatus
  status_label: string
  payer_customer_id: string | null
  customer_name: string | null
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
}

/** The staff payment detail, with the capture-stalled panel the frames show. */
export interface StaffPaymentDetailDto extends StaffPaymentSummaryDto {
  idempotency_key: string
  provider: string
  provider_fee: number | null
  capture_attempts: number
  authorised_at: string | null
  voided_at: string | null
  lines: PaymentLineDto[]
  exception: {
    state: PaymentExceptionState
    detected_at: string
    resolved_at: string | null
    resolved_by: string | null
    resolution: string | null
    note: string | null
  } | null
}

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
}
