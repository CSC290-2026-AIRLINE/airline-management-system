import type { PaymentResultDto } from '../payment-result'

/** The receipts the result page points at, so the buttons open the document they name. */
const CARD_RECEIPT_ID = 'RCT-0042'
const MILES_RECEIPT_ID = 'RCT-0044'
const CARGO_RECEIPT_ID = 'INV-0008'

/**
 * The note the frames put under the heading of the pages that need it.
 *
 * It explains where the screen comes from: Stripe hands the customer back to the selling feature's own confirmation
 * page, and that page polls the payment. The frames leave it off the pages that carry the whole story themselves.
 */
const ANNOTATION =
  'Stripe sends the customer back here. In the product this is the selling feature’s own confirmation page (Feature 3, 6, 12 or 17), which polls the payment and shows these states.'

/**
 * The demo payment results the mock API serves.
 *
 * They are the same payments the receipts and the staff screens tell the story about: a booking that is still being
 * confirmed, a flight paid for with a card, an award booking paid for with miles only, a paid cargo booking, a capture
 * that is still running, a declined card and a hold that ran out. The wording is the frames' own.
 *
 * TODO(F5a): delete this file when the page reads the payment from the API (`GET /api/payments/:reference`), which is
 * what Stripe hands back after the checkout.
 */
export const MOCK_PAYMENT_RESULTS: PaymentResultDto[] = [
  {
    state: 'processing',
    badge: 'Authorised',
    badge_variant: 'warning',
    title: 'Confirming your booking…',
    body: 'Stripe has authorised your card. We are confirming your seats now. This page updates by itself; please do not pay again or close the tab.',
    reference: 'Booking K7QF2M · Payment PAY-20261104-0042',
    actions: [],
    blocks: [],
    progress: true,
    annotation: ANNOTATION,
    note: null,
    mobile: null,
  },
  {
    state: 'paid',
    badge: 'Captured',
    badge_variant: 'success',
    title: 'You are booked on FY214',
    body: 'YGN → BKK · Tue 17 Nov 2026 · 2 adults · seats 12A, 12B. 705.00 USD was charged to the card ending 4242. A receipt has been issued.',
    reference: null,
    actions: [
      { label: 'View receipt', link: { to: '/receipts/$receiptId', receiptId: CARD_RECEIPT_ID }, variant: 'primary' },
      /* The booking feature owns the way back to the start of a booking. */
      { label: 'Back to start', variant: 'outline', hint: 'Coming with the booking feature' },
    ],
    blocks: [],
    annotation: null,
    note: null,
    mobile: {
      summary: ['YGN → BKK · Tue 17 Nov 2026', '2 adults · seats 12A, 12B'],
      charged: 'Charged to card 4242',
      amount: '705.00 USD',
      note: 'If you leave this page, your booking is still safe. We confirm by email.',
    },
  },
  {
    state: 'paid_with_miles',
    badge: 'Paid with miles',
    /* The frame draws "Paid with miles" in the same green as "Captured". */
    badge_variant: 'success',
    title: 'Your booking is confirmed',
    body: 'FY102 · BKK → YGN · Sat 21 Nov 2026 · 1 adult · Paid with 24,000 miles',
    reference: null,
    actions: [],
    /* The frame lists the trip and the passenger on the left and the receipt on the right. */
    blocks: [
      {
        badge: 'Flight FY102',
        title: 'Trip details',
        body: 'BKK 09:40 → YGN 11:00 · Sat 21 Nov 2026 · Direct flight',
        actions: [{ label: 'View trip details', hint: 'Coming with the booking feature' }],
      },
      {
        badge: 'Passenger',
        title: 'Passenger information',
        body: '1 adult passenger · Passenger details are confirmed for this booking.',
        actions: [{ label: 'View passenger details', hint: 'Coming with the booking feature' }],
      },
      {
        badge: 'Receipt issued',
        title: 'Print your receipt',
        body: 'Paid with 24,000 miles. No card was charged (0.00 USD).',
        actions: [
          { label: 'View receipt', link: { to: '/receipts/$receiptId', receiptId: MILES_RECEIPT_ID } },
          { label: 'Print receipt', print: true },
        ],
      },
    ],
    annotation: 'Your booking is confirmed. Keep this page for trip details, passenger information, and your receipt.',
    note: 'Need to make a change? Manage this booking in My Trips.',
    mobile: null,
  },
  {
    state: 'cargo_paid',
    badge: 'Captured',
    badge_variant: 'success',
    title: 'Your cargo is booked',
    /* TODO(F5a): the Air Waybill number comes with the cargo booking; the API does not carry it yet. */
    body: '1,260.00 USD was charged to the card ending 4242. Your Air Waybill is 217-48201936.',
    reference: 'Cargo request CRG-2041 · Payment PAY-20261104-0051',
    actions: [{ label: 'View invoice', link: { to: '/receipts/$receiptId', receiptId: CARGO_RECEIPT_ID }, variant: 'primary' }],
    blocks: [],
    annotation: null,
    note: null,
    mobile: null,
  },
  {
    state: 'capture_stalled',
    badge: 'Confirming payment',
    badge_variant: 'warning',
    title: 'You are booked on FY214',
    body: 'Your booking is confirmed. We are still completing the card charge for 705.00 USD; it is taking longer than usual. You do not need to pay again. We keep retrying and will email you when it finishes.',
    reference: 'Booking K7QF2M · Payment PAY-20261104-0042',
    actions: [{ label: 'View my payments', link: { to: '/receipts' }, variant: 'outline' }],
    blocks: [],
    annotation: ANNOTATION,
    note: null,
    mobile: null,
  },
  {
    state: 'card_declined',
    badge: 'Failed',
    badge_variant: 'destructive',
    title: 'Your card was declined',
    body: 'Nothing was charged. Your seats are still held for 09:12. Try another card to keep them.',
    reference: null,
    /* The card form is Stripe's own page, so this button has nowhere to go yet. */
    actions: [{ label: 'Try another card', variant: 'primary', hint: 'The card form is Stripe’s page' }],
    blocks: [],
    annotation: ANNOTATION,
    note: null,
    mobile: null,
  },
  {
    state: 'hold_expired',
    badge: 'Expired',
    badge_variant: 'warning',
    title: 'Your seat hold ran out',
    body: 'The 15-minute hold ended before payment finished, so the seats were released. Any card authorisation was voided and you were not charged. Search again to pick new seats.',
    reference: null,
    actions: [{ label: 'Start again', variant: 'primary', hint: 'Coming with the booking feature' }],
    blocks: [],
    annotation: ANNOTATION,
    note: null,
    mobile: null,
  },
]
