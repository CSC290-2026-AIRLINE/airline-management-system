import type { PaymentExceptionState, PaymentExceptionTab, PaymentStatus, StaffPaymentFilter } from './types'

/**
 * The wording the staff screens use.
 *
 * Everything staff read about a payment lives here, so a copy change is one edit rather than a hunt through the pages.
 */

/**
 * `705` → `705.00`.
 *
 * The frames' amount column is headed "Amount (USD)", so the cell carries the number and no currency symbol.
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

/**
 * `2026-11-04T10:01:30.000Z` → `4 Nov 09:14`.
 *
 * The short form the frames use inside a table cell, where the full date would crowd the row out. The times are read in
 * UTC, the clock the payment timestamps are stored in, so a payment shows the same time to every member of staff.
 */
export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date)
}

/**
 * `2026-11-04T10:01:30.000Z` → `1 day ago`.
 *
 * The frames' "Since" column reads as a distance, not a date — the staff member wants to know how long a problem has
 * been standing, not the minute it started.
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** The shadcn badge variants (`Badge` has no colours of its own beyond these). */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

/** The shadcn badge variant for each payment status. */
export const STATUS_BADGE_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  created: 'secondary',
  authorised: 'outline',
  captured: 'default',
  failed: 'destructive',
  voided: 'destructive',
  expired: 'secondary',
  reversed: 'secondary',
}

/**
 * The badge colours for each step of a payment's state history.
 *
 * The frames put the step's name in a pill on the right of the row: the steps before the money moved are quiet, the
 * capture is the one that stands out.
 */
export const STATE_STEP_BADGE_VARIANTS: Record<string, BadgeVariant> = {
  created: 'secondary',
  authorised: 'outline',
  confirmed: 'outline',
  captured: 'default',
  failed: 'destructive',
  voided: 'secondary',
  expired: 'secondary',
  reversed: 'secondary',
  stalled: 'destructive',
}

/**
 * The provider's name, in the words the frames use.
 *
 * The mock talks to a fake provider, so the panel says so rather than pretending to be Stripe.
 */
export function providerLabel(provider: string): string {
  if (provider === 'fake') return 'Stripe (simulated)'
  if (provider === 'stripe') return 'Stripe'
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}

/** The lookup's status filters, in the words the frames use. */
export const FILTER_LABELS: Record<StaffPaymentFilter, string> = {
  captured: 'Captured',
  failed: 'Failed',
  capture_stalled: 'Capture stalled',
  voided: 'Voided',
  refunded: 'Refunded',
}

/** The exception list's tabs. */
export const EXCEPTION_TAB_LABELS: Record<PaymentExceptionTab, string> = {
  needs_action: 'Needs action',
  queued: 'Queued',
  resolved: 'Resolved',
  all: 'All',
}

/** The badge variant for each problem state, so the same state always looks the same. */
export const PROBLEM_STATE_BADGE_VARIANTS: Record<PaymentExceptionState, BadgeVariant> = {
  needs_action: 'destructive',
  queued: 'outline',
  resolved: 'default',
}

/** The name of a problem's state, in the words the frames use. */
export const PROBLEM_STATE_LABELS: Record<PaymentExceptionState, string> = {
  needs_action: 'Needs action',
  queued: 'Queued',
  resolved: 'Resolved',
}
