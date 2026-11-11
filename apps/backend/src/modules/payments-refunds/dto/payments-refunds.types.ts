import type {
  CompensationFilter,
  CompensationKind,
  MyRefundTab,
  RefundMethod,
  RefundQueueTab,
  RefundReason,
  RefundStatus,
  VoucherStatus,
} from '../refund-status'

/**
 * The shapes Feature 5b's API returns.
 *
 * The staff and customer frontends mirror these one for one, so the mock data they read today can be swapped for a real
 * response without touching a component. Money is `NUMERIC(12,2)` in the base currency, and travels as a number here.
 */

/** The list wrapper every list endpoint returns, so the frontend always reads `items` off one key. */
export interface ListDto<T> {
  items: T[]
  total: number
}

/* ---- Staff: the refund queue and a refund's detail ------------------------------------------------------------ */

/** One row of the staff refund queue. */
export interface RefundSummaryDto {
  id: string
  /** `REF-0121`. */
  reference: string
  booking_reference: string
  /** Why the refund exists, in the frames' words: "Customer request", "Outside fare rules", "Rebook difference". */
  source_label: string
  reason: RefundReason
  amount: number
  currency: string
  status: RefundStatus
  /** The state in the queue's words: "Needs review", "Refunded", "Voucher issued". */
  status_label: string
  queue_tab: Exclude<RefundQueueTab, 'all'>
  requested_at: string
}

/** What the detail page says about the fare rules. */
export interface FareRuleCheckDto {
  outcome: 'inside' | 'outside'
  /** "Inside rules", "Outside rules (non-refundable fare)". */
  label: string
  /** The sentence under the check. */
  note: string
}

/** The decision, once a staff member has made it. */
export interface RefundDecisionRecordDto {
  decided_at: string
  decided_by: string | null
  /** The reason the customer was sent. */
  note: string | null
  /** True when the approval overrode the fare rules. The override and the staff member's name are in the audit trail. */
  override: boolean
}

/** One refund, with what a staff member needs to decide it. */
export interface RefundDetailDto extends RefundSummaryDto {
  method: RefundMethod
  voucher_amount: number
  fee_withheld: number
  /** The line being refunded: "Extra baggage · 1 × 20 kg · FY214". */
  item: string
  /** What the customer wrote. Null for a refund the system started. */
  customer_reason: string | null
  /** What the customer paid with: "Card 4242 (45.00) · no voucher". */
  paid_by: string
  fare_rule: FareRuleCheckDto
  /** True when approving needs an override, because the fare rules do not allow the refund. */
  needs_override: boolean
  decision: RefundDecisionRecordDto | null
  provider_refund_id: string | null
  voucher_code: string | null
  credit_note_number: string | null
}

/** The staff queue, with the counts the frames show on the tabs. */
export interface RefundQueueListDto extends ListDto<RefundSummaryDto> {
  counts: Record<RefundQueueTab, number>
}

/* ---- Customer: My refunds and My vouchers --------------------------------------------------------------------- */

/** One refund on the customer's "My refunds" page. */
export interface MyRefundDto {
  id: string
  reference: string
  /** What was refunded: "Extra baggage", "Seat 12B", "Flight FY088 cancelled". */
  title: string
  booking_reference: string
  amount: number
  currency: string
  status: RefundStatus
  /** "Awaiting review", "Refunded to card", "Reissued as voucher", "Rejected". */
  status_label: string
  tab: Exclude<MyRefundTab, 'all'>
  requested_at: string
  /** When the money was credited or the voucher issued. Null until then. */
  completed_at: string | null
  /** The decision's date for a refund staff rejected. */
  decided_at: string | null
  /** The sentence under the card, in the customer's words: what happens next, or why it was rejected. */
  outcome_note: string
  credit_note_number: string | null
  voucher_code: string | null
}

/** The customer's refunds, with the counts the frames show on the tabs. */
export interface MyRefundListDto extends ListDto<MyRefundDto> {
  counts: Record<MyRefundTab, number>
}

/** One voucher on the customer's "My vouchers" page. */
export interface MyVoucherDto {
  id: string
  code: string
  amount: number
  currency: string
  status: VoucherStatus
  /** "Active", "Expiring", "Redeemed", "Expired", "Voided". */
  status_label: string
  /** Where it came from: "Issued for cancelled flight FY088". */
  description: string
  issued_at: string
  expires_at: string
  /** Whole days until it ends. Null once it is used or void. */
  expires_in_days: number | null
  redeemed_at: string | null
  /** "Used on booking M3XP9D". Null while it is unused. */
  used_on: string | null
}

export interface MyVoucherListDto extends ListDto<MyVoucherDto> {
  /** How many a customer could still use at checkout. */
  usable: number
}

/* ---- Staff: compensation and vouchers ------------------------------------------------------------------------- */

/** One row of the compensation history: a voucher, or a card refund. */
export interface CompensationEntryDto {
  /** The voucher's id, or the refund's id for a card refund. */
  id: string
  kind: CompensationKind
  booking_reference: string
  /** The amount, in the base currency. */
  value: number
  currency: string
  /** The voucher's code, or the card refund's provider reference. */
  reference: string
  /** The state in the frames' words: "Active", "Expiring", "Redeemed", "Voided", "Paying to card", "Refunded". */
  status_label: string
  /** Why it was issued: "Delay over 3 hours". */
  reason: string
  issued_at: string
  /** True when staff may still void it: an unused voucher. A card refund cannot be taken back. */
  can_void: boolean
}

/** The compensation history, with the counts the frames show on the chips. */
export interface CompensationListDto extends ListDto<CompensationEntryDto> {
  counts: Record<CompensationFilter, number>
}
