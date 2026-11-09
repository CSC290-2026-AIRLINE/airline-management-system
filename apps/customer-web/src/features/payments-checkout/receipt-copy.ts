import type { PaymentStatus, ReceiptDocumentType, RefundState } from './types'

/**
 * The wording the customer's receipts use.
 *
 * Everything the customer reads about a payment lives here, so a copy change is one edit rather than a hunt through the
 * pages.
 */

/** `58.2` + `USD` → `$58.20`. */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

/** `2026-11-06T10:12:00.000Z` → `Nov 6, 2026`. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso))
}

/** `2026-11-06T10:12:00.000Z` → `Nov 6, 2026, 10:12 AM`. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** `40000` → `40,000 miles`. */
export function formatMiles(miles: number): string {
  return `${new Intl.NumberFormat('en-US').format(miles)} miles`
}

/** What the document is called, in the customer's words. */
export const DOCUMENT_LABELS: Record<ReceiptDocumentType, string> = {
  receipt: 'Receipt',
  invoice: 'Cargo invoice',
  credit_note: 'Credit note',
}

/** The customer's name for each payment status. */
export const STATUS_LABELS: Record<PaymentStatus, string> = {
  created: 'Payment pending',
  authorised: 'Payment authorised',
  captured: 'Paid',
  failed: 'Payment failed',
  voided: 'Cancelled',
  expired: 'Expired',
  reversed: 'Refunded',
}

/** The badge colours per status, from the receipt frames. */
export const STATUS_BADGE_CLASSES: Record<PaymentStatus, string> = {
  created: 'bg-secondary text-muted-foreground',
  authorised: 'bg-warning-soft text-warning',
  captured: 'bg-success-soft text-success-strong',
  failed: 'bg-danger-soft text-danger',
  voided: 'bg-danger-soft text-danger',
  expired: 'bg-secondary text-muted-foreground',
  reversed: 'bg-secondary text-foreground',
}

/**
 * What the customer is told about a refund, per state.
 *
 * - `refundable` — the fare rules allow it, so the customer can ask for one.
 * - `not_refundable` — nothing to ask for; the receipt says why.
 * - `ask_staff` — the flight has already gone, so a person has to decide.
 */
export const REFUND_STATE_COPY: Record<RefundState, { label: string; note: string; canRequest: boolean }> = {
  refundable: {
    label: 'Request a refund',
    note: 'This fare is refundable.',
    canRequest: true,
  },
  not_refundable: {
    label: 'Not refundable',
    note: 'This fare cannot be refunded.',
    canRequest: false,
  },
  ask_staff: {
    label: 'Ask staff about a refund',
    note: 'This flight has already departed, so a staff member has to review the refund.',
    canRequest: false,
  },
}
