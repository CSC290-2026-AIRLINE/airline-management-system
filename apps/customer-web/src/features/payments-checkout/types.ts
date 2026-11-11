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

/**
 * The customer's word for a receipt's state, from the frames.
 *
 * The frames show exactly three: "Paid", "Miles + cash" and "Flown". A receipt that was refunded in full still shows
 * "Paid" — the credit note is a separate document, and the original receipt never changes.
 */
export type ReceiptStatus = 'paid' | 'miles_and_cash' | 'flown'

/**
 * The filter chips above the customer's receipts list.
 *
 * The chips cut across the status: "Flights" is every flight receipt, "Cargo" every cargo invoice, "Miles + cash" the
 * split ones, and "With credit note" the receipts a credit note is attached to.
 */
export const RECEIPT_FILTERS = ['all', 'flights', 'miles_and_cash', 'cargo', 'credit_note'] as const
export type ReceiptFilter = (typeof RECEIPT_FILTERS)[number]

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
  /** The customer's word for the state, from the frames. */
  receipt_status: ReceiptStatus
  title: string
  amount: number
  voucher_amount: number
  card_amount: number
  currency: string
  issued_at: string
  booking_reference: string | null
  /** The route the customer flew, e.g. `BKK → CNX`. Null for a purchase that is not a flight. */
  route: string | null
  /** The flight number, e.g. `FY102`. */
  flight_number: string | null
  /** The day of the flight, as an ISO date. */
  flight_date: string | null
  refund_state: RefundState
  has_credit_note: boolean
  /** The miles the booking was redeemed with. Miles are not money — the cash is in `amount`. */
  miles_redeemed: number | null
  /** What the customer paid with, in words: "Card ending 4242", "40,000 miles + card ending 5100". */
  paid_with: string
}

/** The customer's receipt detail. */
export interface ReceiptDetailDto extends ReceiptSummaryDto {
  billing_name: string | null
  card_brand: string | null
  card_last4: string | null
  lines: PaymentLineDto[]
  /**
   * The credit note attached to this receipt, if the payment was reversed. Feature 5b owns the refund itself.
   * `description` says what was refunded, e.g. `seat 12B refund`; null until Feature 5b records it.
   */
  credit_note: { document_number: string; amount: number; issued_at: string; description: string | null } | null
  /** A note about this receipt's refund that the fare rules alone cannot give. Null until Feature 5b provides it. */
  refund_note: string | null
}

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
}

/** The customer's receipt list, with the counts the frames show on the filter chips. */
export interface ReceiptListDto extends ListDto<ReceiptSummaryDto> {
  counts: Record<ReceiptFilter, number>
}
