import type { PaymentExceptionTab, PaymentStatus, StaffPaymentFilter } from './types'

/**
 * The wording the staff screens use.
 *
 * Everything staff read about a payment lives here, so a copy change is one edit rather than a hunt through the pages.
 */

/** `233.4` + `USD` → `$233.40`. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

/** `2026-11-09T09:20:00.000Z` → `Nov 9, 2026, 9:20 AM`. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** The badge colours per status, from the staff payment frames. */
export const STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  created: 'bg-secondary text-muted-foreground',
  authorised: 'bg-warning-soft text-warning',
  captured: 'bg-success-soft text-success-strong',
  failed: 'bg-danger-soft text-danger',
  voided: 'bg-danger-soft text-danger',
  expired: 'bg-secondary text-muted-foreground',
  reversed: 'bg-secondary text-foreground',
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

/**
 * The `last_error` codes the mock can carry, in words a person can act on.
 *
 * TODO(F5a): these are the provider's own codes; the real implementation should map them through one table rather than
 * a `switch`, so a new provider code does not need a frontend change.
 */
export const ERROR_LABELS: Record<string, string> = {
  card_declined: 'Card declined',
  hold_expired: 'The booking hold expired',
  seller_declined: 'The sale did not go through',
  capture_retry_limit_reached: 'The capture failed too many times',
  capture_failed: 'The capture failed',
  authorisation_failed: 'The card could not be authorised',
  voided_by_staff: 'Voided by staff',
}

/** The plain words for an error code, or the code itself when it is not one we know. */
export function errorLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return ERROR_LABELS[code] ?? code.replace(/_/g, ' ')
}
