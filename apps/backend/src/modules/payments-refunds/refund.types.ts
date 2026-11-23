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
  /**
   * `REF-0121` in the mock, `REF-3FA9C21B` on the real table: the schema has no number column, so a stored refund is
   * named by the start of its id. The repository sets it; a refund the service has not saved yet has none.
   */
  reference: string
  payment_id: string
  /** The payment line this refund is for, when the payment has lines. The refund then also writes a `refund_line`. */
  payment_line_id: string | null
  /**
   * The lines this refund splits across, when it covers several (an airline cancel refunds every paid coupon of a
   * payment at once). Absent, the single `payment_line_id` carries the whole amount.
   */
  lines?: { payment_line_id: string; amount: number }[]
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

/**
 * A purchase a refund or a compensation can name by its reference: the payment behind it and the customer who paid.
 * On the real tables the reference is the payment's `purchase_ref` (a booking reference such as `K7QF2M`).
 */
export interface BookingInfo {
  reference: string
  customer_id: string
  payment_id: string
  currency: string
  /** What the payment charged: a card refund on it can never be more than this, less what is already refunded. */
  total: number
  card_brand: string | null
  card_last4: string | null
}

/** The old name, kept so the in-memory seed reads the same. */
export type MockBooking = BookingInfo

/** One line of a payment that a customer can still ask money back for. */
export interface RefundableLine {
  /** The `payment_line` id, or null when the payment has no lines and the whole payment is the one line. */
  payment_line_id: string | null
  description: string
  amount: number
  /** What is left to ask for: the line's amount minus the refunds that are not rejected or failed. */
  remaining: number
}

/** A captured payment of the customer's, with what can still be refunded on it. */
export interface RefundablePayment {
  booking: BookingInfo
  total: number
  lines: RefundableLine[]
}

/** A `flight.cancelled` event with resolution `refund` that 5b has not handled yet. */
export interface FlightCancellation {
  event_id: string
  flight_id: string
  /** The event's insert order: catch-up handles them in this order. */
  seq: number
}

/** A captured payment that has money on a cancelled flight, with the lines (fare, award fee, seat fee) still refundable. */
export interface PaidOnFlight {
  booking: BookingInfo
  lines: { payment_line_id: string; description: string; remaining: number }[]
}

/** One captured payment with what is left on each of its refundable lines, found by its id (a cancelled booking's). */
export interface PaidPayment extends PaidOnFlight {
  amount_total: number
  /** The part of the payment a voucher paid, which a refund returns as a new voucher in the same share. */
  voucher_amount: number
}
