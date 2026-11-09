/**
 * The shapes Feature 5a's customer API returns.
 *
 * These mirror `apps/backend/src/modules/payments-checkout/dto/payments-checkout.types.ts` one for one, so the mock
 * data below can be swapped for a real response without touching a component.
 *
 * TODO(F5a): delete this file and import the response types from the backend's OpenAPI/contract once the API is live.
 */

/** How a receipt can be treated by Feature 5b when the customer asks for a refund. */
export type RefundState = 'refundable' | 'not_refundable' | 'ask_staff'

/** The document kinds the `receipt` table allows. */
export type ReceiptDocumentType = 'receipt' | 'invoice' | 'credit_note'

/** The payment statuses the `payment` table allows. */
export type PaymentStatus = 'created' | 'authorised' | 'captured' | 'failed' | 'voided' | 'expired' | 'reversed'

/** The selling features that can start a payment: 3 (booking), 6 (excess baggage), 12 (onboard sale), 17 (cargo). */
export type PaymentSourceFeature = 3 | 6 | 12 | 17

/** One line on a receipt. */
export interface PaymentLineDto {
  line_type: string
  description: string
  amount: number
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
  /** The miles the booking was redeemed with. Miles are not money — the cash is in `amount`. */
  miles_redeemed: number | null
}

/** The customer's receipt detail. */
export interface ReceiptDetailDto extends ReceiptSummaryDto {
  billing_name: string | null
  card_brand: string | null
  card_last4: string | null
  lines: PaymentLineDto[]
  /** The credit note attached to this receipt, if the payment was reversed. Feature 5b owns the refund itself. */
  credit_note: { document_number: string; amount: number; issued_at: string } | null
}

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
}
