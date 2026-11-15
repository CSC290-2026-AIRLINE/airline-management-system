import type { CustomerPaymentState, ReceiptFilter, StaffPaymentFilter } from '../payment-status'
import type {
  PaymentExceptionState,
  PaymentLineType,
  PaymentProblemAction,
  PaymentProblemType,
  PaymentSourceFeature,
  PaymentStatus,
  ReceiptDocumentType,
} from '../payment.types'

/**
 * The response shapes of Feature 5a's REST surface.
 *
 * These are plain interfaces rather than classes: nothing here is validated on the way out, and a class per row would
 * buy nothing. The query DTOs (the ones that need validation) live next to this file.
 */

/** How a receipt can be treated by Feature 5b when the customer asks for a refund. */
export type RefundState = 'refundable' | 'not_refundable' | 'ask_staff'

/**
 * The customer's word for a receipt's state, from the frames.
 *
 * The frames show exactly three: "Paid", "Miles + cash" and "Flown". A receipt that was refunded in full still shows
 * "Paid" — a credit note is a separate document, and the original receipt never changes.
 */
export type ReceiptStatus = 'paid' | 'miles_and_cash' | 'flown'

/** One line on a receipt. */
export interface PaymentLineDto {
  line_type: PaymentLineType
  description: string
  amount: number
}

/** The customer-facing state of a payment, as the selling feature's confirmation page shows it. */
/** Where to send the customer to pay a card payment on the provider's own page. */
export interface CheckoutStartedDto {
  payment_id: string
  checkout_url: string
}

export interface PaymentStatusDto {
  id: string
  status: PaymentStatus
  state: CustomerPaymentState
  amount_total: number
  voucher_amount: number
  card_amount: number
  currency: string
  capture_stalled: boolean
  /** When the hold runs out. The countdown on the declined frame reads this. */
  expires_at: string
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
  /** The miles the booking was redeemed with. Miles are not money — the cash charged is in `amount`. */
  miles_redeemed: number | null
  /** What the customer paid with, in words: "Card ending 4242", "24,000 miles + card". */
  paid_with: string
}

/** The customer's receipt detail. */
export interface ReceiptDetailDto extends ReceiptSummaryDto {
  billing_name: string | null
  card_brand: string | null
  card_last4: string | null
  lines: PaymentLineDto[]
  /**
   * The credit note attached to this receipt, if the payment was reversed (Feature 5b owns the refund itself).
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
  /** What the customer paid with, in words: "Card ending 4242", "24,000 miles + card", "18,000 miles only". */
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

/** One step of the state history the staff payment detail shows. */
export interface PaymentStateStepDto {
  key: string
  label: string
  at: string | null
}

/** The staff payment detail, with the capture-stalled panel and the state history the frames show. */
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
 * The frames' list is a list of problems, not a list of payments: each row says what went wrong, which reference it
 * belongs to, when it started, and what a staff member can do about it.
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

/** The staff lookup's list, with the counts the frames show on the filter chips. */
export interface StaffPaymentListDto extends ListDto<StaffPaymentSummaryDto> {
  counts: Record<'all' | StaffPaymentFilter, number>
}

/** The staff exception list, with the counts the frames show on the tabs. */
export interface PaymentProblemListDto extends ListDto<PaymentProblemDto> {
  counts: Record<PaymentExceptionState | 'all', number>
}
