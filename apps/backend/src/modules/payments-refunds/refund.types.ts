import type { RefundMethod, RefundReason, RefundStatus, VoucherStatus } from './refund-status'

/**
 * The facts a refund needs that the `refund` row does not hold.
 *
 * A refund row says how much goes where and why. The screens also need things that live in other tables or that the
 * schema does not hold yet: which booking it is about, the line being refunded, what the customer wrote, what the fare
 * rules said, who decided. Until the real tables are read, the mock keeps them here, next to the row.
 *
 * TODO(F5b): each of these is read from its real source — the booking and line from the payment (`payment_line`), the
 * fare rule check from Feature 4's `quote-fee`, the decision from `audit_log`. `customer_reason` has no column yet:
 * `refund.reason` is a closed enum and `decision_note` is the staff's note, so the customer's own words are a schema gap
 * to raise with the Database Team.
 */
export interface RefundContext {
  customer_id: string
  booking_reference: string
  /** The line being refunded, in words: "Extra baggage · 1 × 20 kg · FY214". */
  item: string
  /** What the customer wrote in the request dialog. */
  customer_reason: string | null
  /** What Feature 4's fare rules say about this refund. */
  fare_rule: 'inside' | 'outside'
  /** The fare rule check as the detail page words it: "Inside rules", "Outside rules (non-refundable fare)". */
  fare_rule_label: string
  /** The sentence under the fare rule check. */
  fare_rule_note: string
  /** What the customer paid with, in words: "Card 4242 (45.00) · no voucher". */
  paid_by: string
  card_brand: string | null
  card_last4: string | null
  /** The credit note that came out of the refund, once it succeeded and went to the card. */
  credit_note_number: string | null
  /** The voucher the refund returned, when it went back as a voucher. */
  voucher_code: string | null
  decided_at: Date | null
  decided_by: string | null
  /** True when staff approved a refund the fare rules do not allow. */
  override: boolean
  /** An older refund: the queue lists it only on the "All" tab of an older window, and the customer still sees it. */
  older: boolean
}

/** One row of `refund`, plus the mock's context. */
export interface RefundRecord {
  id: string
  /** The number in `REF-0121`. The schema has no such column; it is `refund_number_seq` in the real feature. */
  number: number
  payment_id: string
  source_key: string
  reason: RefundReason
  method: RefundMethod
  status: RefundStatus
  amount: number
  voucher_amount: number
  fee_withheld: number
  provider_refund_id: string | null
  requested_by_user_id: string | null
  case_compensation_id: string | null
  audit_log_id: string | null
  decision_note: string | null
  failure_reason: string | null
  requested_at: Date
  completed_at: Date | null
  created_at: Date
  updated_at: Date
  context: RefundContext
}

/** One row of `compensation_voucher`, plus what the screens add. */
export interface VoucherRecord {
  id: string
  /** `VCH-7K2M-91QD`. The schema stores ten characters, and the frames show this shorter form. */
  code: string
  customer_id: string
  amount: number
  currency: string
  status: VoucherStatus
  case_compensation_id: string | null
  refund_id: string | null
  issued_at: Date
  expires_at: Date
  redeemed_at: Date | null
  cancel_reason: string | null
  created_at: Date
  updated_at: Date
  /** The booking the voucher was issued for. */
  booking_reference: string
  /** Why it was issued, in words: "Delay over 3 hours". */
  note: string
  /** What the customer's voucher card says about its origin: "Issued for cancelled flight FY088". */
  description: string
  /** What the customer's voucher card says once it is used: "Used on booking M3XP9D". */
  used_on: string | null
}

/** A booking the mock knows, so a refund or a compensation can name it by its reference. */
export interface MockBooking {
  reference: string
  customer_id: string
  payment_id: string
  card_brand: string
  card_last4: string
}
