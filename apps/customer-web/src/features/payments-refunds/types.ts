/**
 * The shapes Feature 5b's customer API returns, mirrored one for one from the backend's
 * `modules/payments-refunds/dto/payments-refunds.types.ts`, so the mock data read today can be swapped for a real
 * response without touching a component.
 */

export const REFUND_STATUSES = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

/** The tabs on My refunds, in the frames' order. */
export const MY_REFUND_TABS = ['all', 'in_progress', 'refunded', 'rejected'] as const
export type MyRefundTab = (typeof MY_REFUND_TABS)[number]

export function isMyRefundTab(value: unknown): value is MyRefundTab {
  return typeof value === 'string' && (MY_REFUND_TABS as readonly string[]).includes(value)
}

export const VOUCHER_STATUSES = ['active', 'redeemed', 'expired', 'cancelled'] as const
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]

/** One refund on the customer's "My refunds" page. */
export interface MyRefundDto {
  id: string
  /** `REF-0121`. */
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
  completed_at: string | null
  decided_at: string | null
  /** The sentence under the card: what happens next, or why it was rejected. */
  outcome_note: string
  credit_note_number: string | null
  voucher_code: string | null
}

export interface MyRefundListDto {
  items: MyRefundDto[]
  total: number
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
  description: string
  issued_at: string
  expires_at: string
  /** Whole days until it ends. Null once it is used or void. */
  expires_in_days: number | null
  redeemed_at: string | null
  /** "Used on booking M3XP9D". Null while it is unused. */
  used_on: string | null
}

export interface MyVoucherListDto {
  items: MyVoucherDto[]
  total: number
  /** How many a customer could still use at checkout. */
  usable: number
}

/** A line the customer can ask money back for. */
export interface RefundableLine {
  description: string
  amount: number
}

/** The receipt the "Request a refund" dialog is opened for. */
export interface RefundReceipt {
  document_number: string
  booking_reference: string
  currency: string
  total: number
  lines: RefundableLine[]
}

/** Body of the "Request a refund" dialog. */
export interface RefundRequestBody {
  item: string
  amount: number
  reason: string
}

/** What the dialog's "Request sent" step shows. */
export interface RefundRequestResult {
  reference: string
  amount: number
  currency: string
  message: string
}
