/**
 * The payment result page: the screen Stripe sends the customer back to.
 *
 * After the checkout, the customer lands here and the page says what the payment is doing — still confirming, paid,
 * paid with miles, a paid cargo booking, a capture that is still running, a declined card, or a hold that ran out.
 *
 * TODO(F5a): in the product this screen is the selling feature's own confirmation page (Feature 3, 6, 12 or 17), which
 * polls the payment and shows these states. The mock keeps them here so Feature 5a owns the wording.
 */

/** The states the page can show, in the frames' order. */
export const PAYMENT_RESULT_STATES = [
  'processing',
  'paid',
  'paid_with_miles',
  'cargo_paid',
  'capture_stalled',
  'card_declined',
  'hold_expired',
] as const
export type PaymentResultState = (typeof PAYMENT_RESULT_STATES)[number]

/** Whether a string from the URL is one of the states the page can show. */
export function isPaymentResultState(value: string): value is PaymentResultState {
  return (PAYMENT_RESULT_STATES as readonly string[]).includes(value)
}

/** The state's name, in the words the frames use. */
export const PAYMENT_RESULT_LABELS: Record<PaymentResultState, string> = {
  processing: 'Processing',
  paid: 'Paid',
  paid_with_miles: 'Paid with miles',
  cargo_paid: 'Cargo paid',
  capture_stalled: 'Capture stalled',
  card_declined: 'Card declined',
  hold_expired: 'Hold expired',
}

/**
 * Where a button on the result goes.
 *
 * The customer app has two places a payment result can point at: the receipt list, and one receipt. Anything else — the
 * booking flow, the trip details, the passenger details — belongs to another feature and is not there yet.
 */
export type PaymentResultLink = { to: '/receipts' } | { to: '/receipts/$receiptId'; receiptId: string }

/** A button on the result. */
export interface PaymentResultAction {
  /** The button's label, in the frames' words. */
  label: string
  /** Where the button goes. Left out when the screen it belongs to is not in this app yet. */
  link?: PaymentResultLink
  /** The button prints the page rather than going anywhere — the receipt is the customer's own document. */
  print?: boolean
  /** The frame's quiet button, next to the main one. */
  variant?: 'primary' | 'outline'
  /** Why the button cannot be pressed yet. */
  hint?: string
}

/** A card of detail under the heading — the frames' trip, passenger and receipt cards on the miles page. */
export interface PaymentResultBlock {
  /** The pill at the top of the card, e.g. "Flight FY102". */
  badge: string
  /** The card's heading, e.g. "Trip details". */
  title: string
  /** The card's detail, e.g. "BKK 09:40 → YGN 11:00 · Sat 21 Nov 2026 · Direct flight". */
  body: string | null
  /** The buttons on the card, e.g. "View trip details". */
  actions: PaymentResultAction[]
}

/** What the phone frame shows instead of the desktop card: the trip in two lines, then the card and the amount. */
export interface PaymentResultMobile {
  /** The trip, a line each, e.g. ["YGN → BKK · Tue 17 Nov 2026", "2 adults · seats 12A, 12B"]. */
  summary: string[]
  /** The line under the divider, e.g. "Charged to card 4242". */
  charged: string
  /** The amount, e.g. "705.00 USD". */
  amount: string
  /** The note at the foot of the phone page. */
  note: string
}

/** One state of the payment result page. */
export interface PaymentResultDto {
  state: PaymentResultState
  /** The pill above the heading, e.g. "Captured". */
  badge: string
  /** The pill's colours, from the status colours the app uses. */
  badge_class: string
  /** The page's heading, e.g. "You are booked on FY214". */
  title: string
  /** The paragraph under the heading. */
  body: string | null
  /** The reference line, e.g. "Booking K7QF2M · Payment PAY-20261104-0042". */
  reference: string | null
  /** The buttons under the card. */
  actions: PaymentResultAction[]
  /** The cards the paid-with-miles page shows under the heading card. */
  blocks: PaymentResultBlock[]
  /** The confirming page shows a bar that fills while the booking is confirmed. */
  progress?: boolean
  /** The note the frame puts under the heading, explaining where the screen comes from. */
  annotation: string | null
  /** The note the frame puts at the foot of the page. */
  note: string | null
  /** What the phone frame shows instead of the desktop card. */
  mobile: PaymentResultMobile | null
}
