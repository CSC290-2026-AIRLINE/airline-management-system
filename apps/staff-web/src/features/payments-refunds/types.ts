/**
 * The shapes Feature 5b's staff API returns, mirrored one for one from the backend's
 * `modules/payments-refunds/dto/payments-refunds.types.ts`, so the mock data read today can be swapped for a real
 * response without touching a component.
 */

export const REFUND_STATUSES = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

export const REFUND_METHODS = ['original', 'voucher'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

/** The queue's tabs, in the frames' order. */
export const REFUND_QUEUE_TABS = ['all', 'needs_review', 'done'] as const
export type RefundQueueTab = (typeof REFUND_QUEUE_TABS)[number]

export function isRefundQueueTab(value: unknown): value is RefundQueueTab {
  return typeof value === 'string' && (REFUND_QUEUE_TABS as readonly string[]).includes(value)
}

/** What a staff member can decide on a refund. */
export const REFUND_DECISIONS = ['approve_card', 'approve_voucher', 'reject'] as const
export type RefundDecision = (typeof REFUND_DECISIONS)[number]

export interface RefundSummaryDto {
  id: string
  /** `REF-0121`. */
  reference: string
  booking_reference: string
  /** Why the refund exists: "Customer request", "Outside fare rules", "Rebook difference". */
  source_label: string
  amount: number
  currency: string
  status: RefundStatus
  /** The state in the queue's words: "Needs review", "Refunded", "Voucher issued". */
  status_label: string
  queue_tab: Exclude<RefundQueueTab, 'all'>
  requested_at: string
}

export interface FareRuleCheckDto {
  outcome: 'inside' | 'outside'
  label: string
  note: string
}

export interface RefundDecisionRecordDto {
  decided_at: string
  decided_by: string | null
  /** The reason the customer was sent. */
  note: string | null
  /** True when the approval overrode the fare rules. */
  override: boolean
}

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
  /** Why the provider did not pay a refund to the card. Null unless the payout failed. */
  failure_reason: string | null
  voucher_code: string | null
  credit_note_number: string | null
}

export interface RefundQueueListDto {
  items: RefundSummaryDto[]
  total: number
  counts: Record<RefundQueueTab, number>
}

/* ---- Compensation and vouchers (frames 04 to 04e) ---------------------------------------------------------------- */

/** The chips on the compensation page. */
export const COMPENSATION_FILTERS = ['all', 'vouchers', 'card_refunds'] as const
export type CompensationFilter = (typeof COMPENSATION_FILTERS)[number]

export function isCompensationFilter(value: unknown): value is CompensationFilter {
  return typeof value === 'string' && (COMPENSATION_FILTERS as readonly string[]).includes(value)
}

/** What staff can issue: a new voucher, or money back to the card. */
export const COMPENSATION_KINDS = ['voucher', 'card_refund'] as const
export type CompensationKind = (typeof COMPENSATION_KINDS)[number]

/** One row of the compensation history: a voucher, or a card refund. */
export interface CompensationEntryDto {
  id: string
  kind: CompensationKind
  booking_reference: string
  value: number
  currency: string
  /** The voucher's code, or the card refund's provider reference. */
  reference: string
  /** "Active", "Expiring", "Redeemed", "Voided", "Paying to card", "Refunded". */
  status_label: string
  reason: string
  issued_at: string
  /** True while staff may still void it: an unused voucher. A card refund cannot be taken back. */
  can_void: boolean
}

export interface CompensationListDto {
  items: CompensationEntryDto[]
  total: number
  counts: Record<CompensationFilter, number>
}

/** Body of the "Issue compensation" dialog. */
export interface IssueCompensationBody {
  booking_reference: string
  kind: CompensationKind
  amount: number
  reason: string
}
