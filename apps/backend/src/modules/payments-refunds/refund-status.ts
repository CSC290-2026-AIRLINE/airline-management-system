/**
 * Every status, reason and screen word Feature 5b uses, in one file.
 *
 * The database has a closed set of statuses (`refund.status`, `compensation_voucher.status` in `schema.sql`), and the
 * frames have their own words for them — "Needs review", "Paying to card", "Voucher issued", "Expiring". The mapping
 * from one to the other lives here and nowhere else, so a copy change or a renamed status is one edit.
 */

/** `refund.status`, from `apps/backend/src/db/schema.sql`. */
export const REFUND_STATUSES = ['requested', 'pending_approval', 'approved', 'processing', 'succeeded', 'failed', 'rejected'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

/** `refund.reason`. */
export const REFUND_REASONS = [
  'customer_cancel',
  'flight_cancelled',
  'rebook_difference',
  'customer_request',
  'staff_adjustment',
  'compensation',
  'cargo_cancel',
  'cargo_rejected',
  'cargo_reweigh',
] as const
export type RefundReason = (typeof REFUND_REASONS)[number]

/** `refund.method`: back to the card, or as a new voucher. */
export const REFUND_METHODS = ['original', 'voucher'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

/** `compensation_voucher.status`. */
export const VOUCHER_STATUSES = ['active', 'redeemed', 'expired', 'cancelled'] as const
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number]

/** The staff refund queue's tabs, in the frames' order. */
export const REFUND_QUEUE_TABS = ['all', 'needs_review', 'done'] as const
export type RefundQueueTab = (typeof REFUND_QUEUE_TABS)[number]

/** The customer's "My refunds" tabs. */
export const MY_REFUND_TABS = ['all', 'in_progress', 'refunded', 'rejected'] as const
export type MyRefundTab = (typeof MY_REFUND_TABS)[number]

/** The chips on the staff "Compensation & vouchers" page. */
export const COMPENSATION_FILTERS = ['all', 'vouchers', 'card_refunds'] as const
export type CompensationFilter = (typeof COMPENSATION_FILTERS)[number]

/** What a compensation row is: a voucher, or a card refund. */
export type CompensationKind = 'voucher' | 'card_refund'

/** A voucher that ends within this many days is shown as "Expiring" (the frames show "Expires in 9 days"). */
export const EXPIRING_SOON_DAYS = 14

/** How long a voucher lasts. The real value is `payment_setting.voucher_valid_months`. */
export const VOUCHER_VALID_MONTHS = 12

/**
 * Which side of the queue a refund sits on.
 *
 * `failed` stays on "Needs review": the schema's `refund_queue_idx` keeps it in the queue, because a person has to look
 * at a refund whose payout failed.
 */
export function queueTabFor(status: RefundStatus): 'needs_review' | 'done' {
  return status === 'requested' || status === 'pending_approval' || status === 'failed' ? 'needs_review' : 'done'
}

/** The staff's word for a refund's state, in the queue's Status column and on the detail header. */
export function staffRefundLabel(status: RefundStatus, method: RefundMethod): string {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'Needs review'
    case 'approved':
    case 'processing':
      return 'Paying to card'
    case 'succeeded':
      return method === 'voucher' ? 'Voucher issued' : 'Refunded'
    case 'failed':
      return 'Payout failed'
    case 'rejected':
      return 'Rejected'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** Which "My refunds" tab a refund belongs to. */
export function myRefundTabFor(status: RefundStatus): Exclude<MyRefundTab, 'all'> {
  if (status === 'succeeded') return 'refunded'
  if (status === 'rejected') return 'rejected'
  return 'in_progress'
}

/** The customer's word for a refund's state. */
export function customerRefundLabel(status: RefundStatus, method: RefundMethod): string {
  switch (status) {
    case 'requested':
    case 'pending_approval':
      return 'Awaiting review'
    case 'approved':
    case 'processing':
      return 'Paying to card'
    case 'succeeded':
      return method === 'voucher' ? 'Reissued as voucher' : 'Refunded to card'
    case 'failed':
      return 'Being looked into'
    case 'rejected':
      return 'Rejected'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** The "Source" column of the queue: why the refund exists. */
export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  customer_cancel: 'Customer request',
  customer_request: 'Customer request',
  flight_cancelled: 'Flight cancelled',
  rebook_difference: 'Rebook difference',
  staff_adjustment: 'Staff adjustment',
  compensation: 'Compensation',
  cargo_cancel: 'Cargo cancelled',
  cargo_rejected: 'Cargo rejected',
  cargo_reweigh: 'Cargo reweigh',
}

/** Refunds that belong to the compensation page rather than the queue the customer's requests go through. */
export const COMPENSATION_REASONS: readonly RefundReason[] = ['staff_adjustment', 'compensation']

/** The voucher's state as the frames word it: "Expiring" is an active voucher close to its end. */
export function voucherLabel(status: VoucherStatus, expiringSoon: boolean): string {
  switch (status) {
    case 'active':
      return expiringSoon ? 'Expiring' : 'Active'
    case 'redeemed':
      return 'Redeemed'
    case 'expired':
      return 'Expired'
    case 'cancelled':
      return 'Voided'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** The state of a card refund on the compensation page. */
export function cardRefundLabel(status: RefundStatus): string {
  if (status === 'succeeded') return 'Refunded'
  if (status === 'failed') return 'Payout failed'
  if (status === 'rejected') return 'Rejected'
  return 'Paying to card'
}
