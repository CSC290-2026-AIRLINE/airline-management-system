import type { PaymentStatus, ReceiptDocumentType, ReceiptFilter, ReceiptStatus, RefundState } from './types'

/**
 * The wording the customer's receipts use.
 *
 * Everything the customer reads about a payment lives here, so a copy change is one edit rather than a hunt through the
 * pages.
 */

/** The shadcn `Badge` variants the receipt screens use. */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

/** `2026-11-06T10:12:00.000Z` → `Nov 6, 2026, 10:12 AM`. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/**
 * `2026-11-17` → `Tue 17 Nov 2026`, the way the frames write a flight day.
 *
 * A date-only value is a calendar day, so it is read in the local time zone. Letting it fall back to UTC would move
 * the day back one for anyone west of Greenwich.
 *
 * A flight that has already gone is written without its weekday — `19 Oct 2026` — which is how the frames write the
 * receipts of the flights that have flown.
 */
export function formatFlightDate(iso: string, flown = false): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
  const options: Intl.DateTimeFormatOptions = flown
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
  return new Intl.DateTimeFormat('en-GB', options).format(date)
}

/** `2026-11-04T09:14:00.000Z` → `4 Nov 2026`, the day a receipt was issued. */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/**
 * The note that sits between the flight number and the day.
 *
 * A booking paid for with miles is an award seat — that is the frame's word for it. The API does not carry the fare type
 * yet, so the note comes from the miles on the receipt.
 *
 * TODO(F5a): take the fare type from the API and delete this.
 */
export function tripNote(receipt: { miles_redeemed: number | null }): string | null {
  return receipt.miles_redeemed ? 'award seat' : null
}

/**
 * The city behind an airport code, for the receipt's route line.
 *
 * The frames put the two airport codes in big letters with the city under each one. The API does not carry the city
 * yet, so this is the mock's own list.
 *
 * TODO(F5a): take the city from the API with the rest of the trip, and delete this map.
 */
export const AIRPORT_CITIES: Record<string, string> = {
  BKK: 'Bangkok',
  CNX: 'Chiang Mai',
  DMK: 'Don Mueang',
  HKT: 'Phuket',
  MDL: 'Mandalay',
  MDY: 'Mandalay',
  RGN: 'Yangon',
  SIN: 'Singapore',
  YGN: 'Yangon',
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

/** The shadcn badge variant for each receipt state. */
export const RECEIPT_STATUS_BADGE_VARIANTS: Record<ReceiptStatus, BadgeVariant> = {
  paid: 'success',
  miles_and_cash: 'secondary',
  flown: 'outline',
}

/** The filter chips above the receipts list, in the frames' words. */
export const RECEIPT_FILTER_LABELS: Record<ReceiptFilter, string> = {
  all: 'All receipts',
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

/** The shadcn badge variant for each payment status. */
export const STATUS_BADGE_VARIANTS: Record<PaymentStatus, BadgeVariant> = {
  created: 'secondary',
  authorised: 'warning',
  captured: 'success',
  failed: 'destructive',
  voided: 'destructive',
  expired: 'secondary',
  reversed: 'secondary',
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
 *
 * `action` is the button the frame puts under the receipt, and it is null when the frame puts no button at all.
 */
export const REFUND_STATE_COPY: Record<RefundState, { label: string; note: string; action: string | null }> = {
  refundable: {
    label: 'Refundable',
    note: 'This fare can be refunded. Refund requests are handled by staff.',
    action: 'Request a refund',
  },
  not_refundable: {
    label: 'Not refundable',
    note: 'Flown more than 14 days ago; refunds are closed for this booking.',
    action: null,
  },
  ask_staff: {
    label: 'Ask staff',
    note: 'This flight has flown, so it is outside the fare rules. Staff can approve a goodwill refund.',
    action: 'Ask staff to review',
  },
}

/** What a cargo receipt says about its refunds: they belong to the cargo booking page. */
export const CARGO_REFUND_NOTE = 'Cargo cancellations and refunds are handled from the cargo booking page.'

/** The button the cargo frame puts beside "Download invoice": a cargo is cancelled from its own booking page. */
export const CARGO_REFUND_ACTION = 'Cancel in My cargo'

/** What a booking paid for with miles says about them: they go back to the balance. */
export const MILES_REFUND_NOTE = 'Miles are returned to your balance and cash goes back to the card.'
