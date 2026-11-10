import type { PaymentStatus, ReceiptDocumentType, ReceiptFilter, ReceiptStatus, RefundState } from './types'

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

/** `2026-11-06T10:12:00.000Z` → `Nov 6, 2026, 10:12 AM`. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** `40000` → `40,000 miles`. */
export function formatMiles(miles: number): string {
  return `${new Intl.NumberFormat('en-US').format(miles)} miles`
}

/**
 * `705` → `705.00`.
 *
 * The frames' total column is headed "Total (USD)", so the cell carries the number and no currency symbol.
 */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

/** The customer's word for a receipt's state, from the frames. */
export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  paid: 'Paid',
  miles_and_cash: 'Miles + cash',
  flown: 'Flown',
}

/** The badge colours for the receipt states, from the frames. */
export const RECEIPT_STATUS_BADGE_CLASSES: Record<ReceiptStatus, string> = {
  paid: 'bg-success-soft text-success-strong',
  miles_and_cash: 'bg-warning-soft text-warning',
  flown: 'bg-secondary text-muted-foreground',
}

/** The filter chips above the receipts list, in the frames' words. */
export const RECEIPT_FILTER_LABELS: Record<ReceiptFilter, string> = {
  all: 'All',
  flights: 'Flights',
  miles_and_cash: 'Miles + cash',
  cargo: 'Cargo',
  credit_note: 'With credit note',
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
 * The receipt only says where the fare stands — it never asks for the refund itself. That request belongs to Feature
 * 5b, so this release shows the state and stops there.
 *
 * - `refundable` — the fare rules allow it.
 * - `not_refundable` — nothing to ask for; the receipt says why.
 * - `ask_staff` — the flight has already gone, so a person has to decide.
 */
export const REFUND_STATE_COPY: Record<RefundState, { label: string; note: string }> = {
  refundable: {
    label: 'Refundable',
    note: 'This fare can be refunded. Refund requests are handled by staff.',
  },
  not_refundable: {
    label: 'Not refundable',
    note: 'This fare cannot be refunded.',
  },
  ask_staff: {
    label: 'Ask staff',
    note: 'This flight has already departed, so a staff member has to review the refund.',
  },
}
