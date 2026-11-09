import type { CustomerPaymentState } from '../payment-status'
import type { PaymentExceptionState, PaymentLineType, PaymentSourceFeature, PaymentStatus, ReceiptDocumentType } from '../payment.types'

/**
 * The response shapes of Feature 5a's REST surface.
 *
 * These are plain interfaces rather than classes: nothing here is validated on the way out, and a class per row would
 * buy nothing. The query DTOs (the ones that need validation) live next to this file.
 */

/** How a receipt can be treated by Feature 5b when the customer asks for a refund. */
export type RefundState = 'refundable' | 'not_refundable' | 'ask_staff'

/** One line on a receipt. */
export interface PaymentLineDto {
  line_type: PaymentLineType
  description: string
  amount: number
}

/** The customer-facing state of a payment, as the selling feature's confirmation page shows it. */
export interface PaymentStatusDto {
  id: string
  status: PaymentStatus
  state: CustomerPaymentState
  amount_total: number
  voucher_amount: number
  card_amount: number
  currency: string
  capture_stalled: boolean
  receipt_id: string | null
  updated_at: string
}

/** One row of the customer's receipts list. */
export interface ReceiptSummaryDto {
  id: string
  document_number: string
  document_type: ReceiptDocumentType
  payment_id: string
  source_feature: PaymentSourceFeature
  source_feature_label: string
  status: PaymentStatus
  title: string
  amount: number
  voucher_amount: number
  card_amount: number
  currency: string
  issued_at: string
  booking_reference: string | null
  refund_state: RefundState
  has_credit_note: boolean
  /** The miles the booking was redeemed with. Miles are not money — the cash charged is in `amount`. */
  miles_redeemed: number | null
}

/** The customer's receipt detail. */
export interface ReceiptDetailDto extends ReceiptSummaryDto {
  billing_name: string | null
  card_brand: string | null
  card_last4: string | null
  lines: PaymentLineDto[]
  /** The credit note attached to this receipt, if the payment was reversed (Feature 5b owns the refund itself). */
  credit_note: { document_number: string; amount: number; issued_at: string } | null
}

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
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
