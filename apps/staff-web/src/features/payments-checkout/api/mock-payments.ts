import type { PaymentLineDto, PaymentSourceFeature, PaymentStateStepDto, PaymentStatus, StaffPaymentDetailDto } from '../types'

/**
 * The demo payments the mock staff API serves.
 *
 * They are the frames' own rows. The lookup frames list nine payments — five captured, one failed, one with a stalled
 * capture, one voided and one refunded — and the payment frames open two of them. The exception frames talk about a few
 * more (a ticket and a cargo capture that stalled, a payment that is waiting for Stripe, a posting the ledger did not
 * accept and an authorisation that was voided). Those are "older" payments: the lookup does not list them until the
 * staff member searches, which is what the frames' footer says — "older payments need a search" — but the exception list
 * and the payment links reach them.
 *
 * The times are in UTC and fixed rather than relative to "now", so the lists do not reorder themselves while you are
 * looking at them.
 *
 * TODO(F5a): delete this file when the staff payment list comes from `GET /api/staff/payments`.
 */

/** The clock the mock reads. Fixed, so the exception tabs always show the same rows. */
export const MOCK_NOW = '2026-11-09T10:00:00.000Z'

const CUSTOMER_ID = 'c0000000-0000-4000-8000-0000000000c1'

/** The fields every row carries that the backend derives rather than stores. */
interface MockRow {
  id: string
  purchase_ref: string
  source_feature: PaymentSourceFeature
  source_feature_label: string
  status: PaymentStatus
  status_label: string
  customer_name: string
  customer_email: string
  booking_reference?: string | null
  card_brand?: string | null
  card_last4?: string | null
  miles_redeemed?: number | null
  amount_total: number
  voucher_amount?: number
  currency?: string
  started_at: string
  expires_at: string
  authorised_at?: string | null
  confirmed_at?: string | null
  captured_at?: string | null
  voided_at?: string | null
  capture_stalled_at?: string | null
  capture_attempts?: number
  last_error?: string | null
  provider?: string
  provider_fee?: number | null
  provider_reference?: string | null
  trip?: string | null
  refund_reference?: string | null
  receipt_id?: string | null
  idempotency_key: string
  lines: PaymentLineDto[]
  exception?: StaffPaymentDetailDto['exception']
  state_history: PaymentStateStepDto[]
  /** When the payment last moved, if it is not the time of its last step. */
  updated_at?: string
  /** An older payment: the lookup lists it only when the search finds it. */
  older?: boolean
}

/** `pay_…0001` + `2026-11-03` → `PAY-20261103-0001`, the reference the frames show. */
function reference(id: string, startedAt: string): string {
  const day = startedAt.slice(0, 10).replace(/-/g, '')
  const suffix = id
    .replace(/[^0-9A-Za-z]/g, '')
    .slice(-4)
    .toUpperCase()
  return `PAY-${day}-${suffix}`
}

/** `40000` → `40,000 miles`, the way the frames write it. */
function milesText(miles: number | null | undefined): string {
  if (!miles) return ''
  return `${new Intl.NumberFormat('en-US').format(miles)} miles`
}

/** The card the payment was made with, in the words the frames use. */
function paidWith(row: MockRow, cardAmount: number): string {
  const miles = milesText(row.miles_redeemed)
  if (miles && cardAmount > 0) return `${miles} + card`
  if (miles) return `${miles} only`
  if (row.voucher_amount && row.voucher_amount > 0 && cardAmount === 0) return 'Voucher'
  if (row.card_last4) return `Card ending ${row.card_last4}`
  return '—'
}

/** A state step, so the rows below read as a story rather than as objects. */
function step(key: string, label: string, at: string): PaymentStateStepDto {
  return { key, label, at }
}

/** The id for a payment number, so a reference such as `PAY-20261104-0042` can be read back from it. */
function payId(suffix: string): string {
  return `pay_00000000-0000-4000-8000-00000000${suffix}`
}

/** Fills in the fields the backend derives, so a row only spells out what is really its own. */
function toDetail(row: MockRow): StaffPaymentDetailDto {
  const voucherAmount = row.voucher_amount ?? 0
  const cardAmount = Math.round((row.amount_total - voucherAmount) * 100) / 100
  const lastStep = row.state_history[row.state_history.length - 1]
  return {
    id: row.id,
    reference: reference(row.id, row.started_at),
    purchase_ref: row.purchase_ref,
    source_feature: row.source_feature,
    source_feature_label: row.source_feature_label,
    status: row.status,
    status_label: row.status_label,
    payer_customer_id: CUSTOMER_ID,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    booking_reference: row.booking_reference ?? null,
    paid_with: paidWith(row, cardAmount),
    card_brand: row.card_brand ?? null,
    card_last4: row.card_last4 ?? null,
    miles_redeemed: row.miles_redeemed ?? null,
    amount_total: row.amount_total,
    voucher_amount: voucherAmount,
    card_amount: cardAmount,
    currency: row.currency ?? 'USD',
    started_at: row.started_at,
    expires_at: row.expires_at,
    captured_at: row.captured_at ?? null,
    capture_stalled_at: row.capture_stalled_at ?? null,
    last_error: row.last_error ?? null,
    receipt_id: row.receipt_id ?? null,
    updated_at: row.updated_at ?? lastStep?.at ?? row.started_at,
    idempotency_key: row.idempotency_key,
    provider: row.provider ?? 'stripe',
    provider_fee: row.provider_fee ?? null,
    provider_reference: row.provider_reference ?? null,
    trip: row.trip ?? null,
    refund_reference: row.refund_reference ?? null,
    capture_attempts: row.capture_attempts ?? 0,
    authorised_at: row.authorised_at ?? null,
    voided_at: row.voided_at ?? null,
    lines: row.lines,
    state_history: row.state_history,
    exception: row.exception ?? null,
  }
}

const MOCK_ROWS: MockRow[] = [
  /* ---- The nine payments the lookup lists ------------------------------------------------------------------- */
  {
    id: payId('0042'),
    purchase_ref: 'booking:bk_k7qf2m',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Aye Chan',
    customer_email: 'aye.chan@example.com',
    booking_reference: 'K7QF2M',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 705,
    started_at: '2026-11-04T09:12:00.000Z',
    expires_at: '2026-11-04T09:27:00.000Z',
    authorised_at: '2026-11-04T09:14:00.000Z',
    confirmed_at: '2026-11-04T09:14:00.000Z',
    captured_at: '2026-11-04T09:14:00.000Z',
    provider_fee: 20.45,
    provider_reference: 'pi_3Q…x9A',
    trip: 'FY214 YGN → BKK',
    refund_reference: 'REF-0121',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000001',
    idempotency_key: 'demo-idem-0042',
    lines: [
      { line_type: 'fare', description: 'Fare · 2 adults', amount: 624 },
      { line_type: 'seat', description: 'Seat selection (18.00 refunded)', amount: 36 },
      { line_type: 'baggage', description: 'Extra baggage', amount: 45 },
    ],
    state_history: [
      step('created', 'created', '2026-11-04T09:12:00.000Z'),
      step('authorised', 'authorised', '2026-11-04T09:14:00.000Z'),
      step('captured', 'captured', '2026-11-04T09:14:00.000Z'),
    ],
  },
  {
    id: payId('0051'),
    purchase_ref: 'cargo_booking:cb_crg2041',
    source_feature: 17,
    source_feature_label: 'Cargo',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Tun Trading',
    customer_email: 'tun.trading@example.com',
    booking_reference: 'CRG-2041',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 1260,
    started_at: '2026-11-04T10:00:00.000Z',
    expires_at: '2026-11-04T10:30:00.000Z',
    authorised_at: '2026-11-04T10:01:00.000Z',
    confirmed_at: '2026-11-04T10:01:30.000Z',
    captured_at: '2026-11-04T10:02:00.000Z',
    provider_fee: 36.54,
    trip: 'FY214 YGN → BKK',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000005',
    idempotency_key: 'demo-idem-0051',
    lines: [
      { line_type: 'cargo_freight', description: 'Freight · 180 kg chargeable × 6.50', amount: 1170 },
      { line_type: 'cargo_surcharge', description: 'Handling surcharge', amount: 90 },
    ],
    state_history: [
      step('created', 'created', '2026-11-04T10:00:00.000Z'),
      step('authorised', 'authorised', '2026-11-04T10:01:00.000Z'),
      step('captured', 'captured', '2026-11-04T10:02:00.000Z'),
    ],
  },
  {
    id: payId('0044'),
    purchase_ref: 'booking:bk_w4nb8t',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Min Zaw',
    customer_email: 'min.zaw@example.com',
    booking_reference: 'W4NB8T',
    card_brand: 'Visa',
    card_last4: '4242',
    miles_redeemed: 24000,
    amount_total: 215,
    started_at: '2026-11-04T09:38:00.000Z',
    expires_at: '2026-11-04T09:53:00.000Z',
    authorised_at: '2026-11-04T09:39:00.000Z',
    confirmed_at: '2026-11-04T09:39:30.000Z',
    captured_at: '2026-11-04T09:40:00.000Z',
    provider_fee: 6.24,
    provider_reference: 'pi_3Q…k4C',
    trip: 'FY102 BKK → YGN',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000002',
    idempotency_key: 'demo-idem-0044',
    lines: [
      { line_type: 'miles', description: 'Paid with 24,000 miles', amount: 0 },
      { line_type: 'taxes', description: 'Taxes and carrier charges · 1 adult', amount: 185 },
      { line_type: 'seat', description: 'Seat selection · 4C', amount: 30 },
    ],
    state_history: [
      step('created', 'created', '2026-11-04T09:38:00.000Z'),
      step('authorised', 'authorised', '2026-11-04T09:39:00.000Z'),
      step('captured', 'captured', '2026-11-04T09:40:00.000Z'),
    ],
  },
  {
    id: payId('0031'),
    purchase_ref: 'booking:bk_l9tx4b',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Su Myat',
    customer_email: 'su.myat@example.com',
    booking_reference: 'L9TX4B',
    miles_redeemed: 18000,
    amount_total: 0,
    started_at: '2026-11-02T16:18:00.000Z',
    expires_at: '2026-11-02T16:33:00.000Z',
    authorised_at: '2026-11-02T16:19:00.000Z',
    confirmed_at: '2026-11-02T16:19:30.000Z',
    captured_at: '2026-11-02T16:20:00.000Z',
    trip: 'FY102 BKK → YGN',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000003',
    idempotency_key: 'demo-idem-0031',
    lines: [{ line_type: 'miles', description: 'Paid with 18,000 miles', amount: 0 }],
    state_history: [
      step('created', 'created', '2026-11-02T16:18:00.000Z'),
      step('authorised', 'authorised', '2026-11-02T16:19:00.000Z'),
      step('captured', 'captured', '2026-11-02T16:20:00.000Z'),
    ],
  },
  {
    id: payId('0038'),
    purchase_ref: 'booking:bk_r5nh7c',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Khin Lay',
    customer_email: 'khin.lay@example.com',
    booking_reference: 'R5NH7C',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 210,
    started_at: '2026-11-03T14:03:00.000Z',
    expires_at: '2026-11-03T14:18:00.000Z',
    authorised_at: '2026-11-03T14:04:00.000Z',
    confirmed_at: '2026-11-03T14:04:30.000Z',
    captured_at: '2026-11-03T14:05:00.000Z',
    provider_fee: 6.09,
    trip: 'FY310 YGN → MDL',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000004',
    idempotency_key: 'demo-idem-0038',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 210 }],
    state_history: [
      step('created', 'created', '2026-11-03T14:03:00.000Z'),
      step('authorised', 'authorised', '2026-11-03T14:04:00.000Z'),
      step('captured', 'captured', '2026-11-03T14:05:00.000Z'),
    ],
  },
  {
    id: payId('0033'),
    purchase_ref: 'booking:bk_h2jd6a',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'failed',
    status_label: 'Failed',
    customer_name: 'Ko Ko',
    customer_email: 'ko.ko@example.com',
    booking_reference: 'H2JD6A',
    card_brand: 'Visa',
    card_last4: '1881',
    amount_total: 330,
    started_at: '2026-11-03T11:46:00.000Z',
    expires_at: '2026-11-03T12:01:00.000Z',
    last_error: 'card_declined',
    trip: 'FY214 YGN → BKK',
    idempotency_key: 'demo-idem-0033',
    lines: [{ line_type: 'fare', description: 'Fare · 2 adults', amount: 330 }],
    state_history: [step('created', 'created', '2026-11-03T11:46:00.000Z'), step('failed', 'card declined', '2026-11-03T11:48:00.000Z')],
  },
  {
    id: payId('0029'),
    purchase_ref: 'booking:bk_n8cp3z',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Capture stalled',
    customer_name: 'Thida W',
    customer_email: 'thida.w@example.com',
    booking_reference: 'N8CP3Z',
    card_brand: 'Visa',
    card_last4: '5544',
    amount_total: 498,
    started_at: '2026-11-02T18:28:00.000Z',
    expires_at: '2026-11-02T18:43:00.000Z',
    authorised_at: '2026-11-02T18:30:00.000Z',
    confirmed_at: '2026-11-02T18:30:00.000Z',
    capture_stalled_at: '2026-11-02T18:31:00.000Z',
    capture_attempts: 3,
    last_error: 'capture_retry_limit_reached',
    trip: 'FY214 YGN → BKK',
    idempotency_key: 'demo-idem-0029',
    lines: [{ line_type: 'fare', description: 'Fare · 2 adults', amount: 498 }],
    state_history: [
      step('created', 'created', '2026-11-02T18:28:00.000Z'),
      step('authorised', 'authorised', '2026-11-02T18:30:00.000Z'),
      step('confirmed', 'booking confirmed', '2026-11-02T18:30:00.000Z'),
      step('stalled', 'capture stalled', '2026-11-02T18:31:00.000Z'),
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-02T18:31:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 3 times: capture_retry_limit_reached',
    },
  },
  {
    id: payId('0021'),
    purchase_ref: 'booking:bk_f6rw9k',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'voided',
    status_label: 'Voided',
    customer_name: 'Zaw Min',
    customer_email: 'zaw.min@example.com',
    booking_reference: 'F6RW9K',
    card_brand: 'Visa',
    card_last4: '7310',
    amount_total: 180,
    started_at: '2026-11-01T20:07:00.000Z',
    expires_at: '2026-11-01T20:22:00.000Z',
    authorised_at: '2026-11-01T20:08:00.000Z',
    voided_at: '2026-11-01T20:10:00.000Z',
    trip: 'FY310 YGN → MDL',
    idempotency_key: 'demo-idem-0021',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 180 }],
    state_history: [
      step('created', 'created', '2026-11-01T20:07:00.000Z'),
      step('authorised', 'authorised', '2026-11-01T20:08:00.000Z'),
      step('voided', 'authorisation released', '2026-11-01T20:10:00.000Z'),
    ],
  },
  {
    id: payId('0017'),
    purchase_ref: 'booking:bk_q2lv8r',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'reversed',
    status_label: 'Refunded',
    customer_name: 'Hla Aung',
    customer_email: 'hla.aung@example.com',
    booking_reference: 'Q2LV8R',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 150,
    started_at: '2026-10-31T08:41:00.000Z',
    expires_at: '2026-10-31T08:56:00.000Z',
    authorised_at: '2026-10-31T08:43:00.000Z',
    confirmed_at: '2026-10-31T08:43:30.000Z',
    captured_at: '2026-10-31T08:44:00.000Z',
    provider_fee: 4.35,
    trip: 'FY102 BKK → YGN',
    refund_reference: 'REF-0117',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000006',
    idempotency_key: 'demo-idem-0017',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 150 }],
    state_history: [
      step('created', 'created', '2026-10-31T08:41:00.000Z'),
      step('authorised', 'authorised', '2026-10-31T08:43:00.000Z'),
      step('captured', 'captured', '2026-10-31T08:44:00.000Z'),
    ],
  },

  /* ---- Older payments: the exception frames' rows, reached by a search or a link ------------------------------- */
  {
    id: payId('0027'),
    older: true,
    purchase_ref: 'booking:bk_h2vm6p',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Capture stalled',
    customer_name: 'Ma Nu',
    customer_email: 'ma.nu@example.com',
    booking_reference: 'H2VM6P',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 340,
    started_at: '2026-11-03T09:00:00.000Z',
    expires_at: '2026-11-03T09:15:00.000Z',
    authorised_at: '2026-11-03T09:02:00.000Z',
    confirmed_at: '2026-11-03T09:03:00.000Z',
    capture_stalled_at: '2026-11-08T08:00:00.000Z',
    capture_attempts: 5,
    last_error: 'capture_retry_limit_reached',
    trip: 'FY214 YGN → BKK',
    idempotency_key: 'demo-idem-0027',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 340 }],
    state_history: [
      step('created', 'created', '2026-11-03T09:00:00.000Z'),
      step('authorised', 'authorised', '2026-11-03T09:02:00.000Z'),
      step('confirmed', 'booking confirmed', '2026-11-03T09:03:00.000Z'),
      step('stalled', 'capture stalled', '2026-11-08T08:00:00.000Z'),
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-08T08:00:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 5 times: capture_retry_limit_reached',
    },
  },
  {
    /* The frames call this one `PAY-20261103-0033` too, but that reference is the declined card above, so it takes the next. */
    id: payId('0034'),
    older: true,
    purchase_ref: 'cargo_booking:cb_awb217',
    source_feature: 17,
    source_feature_label: 'Cargo',
    status: 'authorised',
    status_label: 'Capture stalled',
    customer_name: 'Tun Trading',
    customer_email: 'tun.trading@example.com',
    booking_reference: 'AWB 217-48201936',
    card_brand: 'Visa',
    card_last4: '1881',
    amount_total: 820,
    started_at: '2026-11-03T10:00:00.000Z',
    expires_at: '2026-11-03T10:30:00.000Z',
    authorised_at: '2026-11-03T10:02:00.000Z',
    confirmed_at: '2026-11-03T10:04:00.000Z',
    capture_stalled_at: '2026-11-08T07:00:00.000Z',
    capture_attempts: 5,
    last_error: 'capture_retry_limit_reached',
    idempotency_key: 'demo-idem-0034',
    lines: [
      { line_type: 'cargo_freight', description: 'Freight · 120 kg chargeable × 6.00', amount: 720 },
      { line_type: 'cargo_surcharge', description: 'Oversize surcharge', amount: 100 },
    ],
    state_history: [
      step('created', 'created', '2026-11-03T10:00:00.000Z'),
      step('authorised', 'authorised', '2026-11-03T10:02:00.000Z'),
      step('confirmed', 'booking confirmed', '2026-11-03T10:04:00.000Z'),
      step('stalled', 'capture stalled', '2026-11-08T07:00:00.000Z'),
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-08T07:00:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 5 times: capture_retry_limit_reached',
    },
  },
  {
    id: payId('0018'),
    older: true,
    purchase_ref: 'booking:bk_c7ln1s',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Authorised',
    customer_name: 'Kyaw S',
    customer_email: 'kyaw.s@example.com',
    booking_reference: 'C7LN1S',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 275,
    started_at: '2026-11-09T09:30:00.000Z',
    expires_at: '2026-11-09T09:45:00.000Z',
    authorised_at: '2026-11-09T09:31:00.000Z',
    trip: 'FY102 BKK → YGN',
    idempotency_key: 'demo-idem-0018',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 275 }],
    state_history: [step('created', 'created', '2026-11-09T09:30:00.000Z'), step('authorised', 'authorised', '2026-11-09T09:31:00.000Z')],
  },
  {
    id: payId('0014'),
    older: true,
    purchase_ref: 'booking:bk_6b0a44',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    customer_name: 'Naing L',
    customer_email: 'naing.l@example.com',
    booking_reference: 'FLY6GH',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 156.2,
    started_at: '2026-11-09T07:00:00.000Z',
    expires_at: '2026-11-09T07:15:00.000Z',
    authorised_at: '2026-11-09T07:01:00.000Z',
    confirmed_at: '2026-11-09T07:02:00.000Z',
    captured_at: '2026-11-09T07:03:00.000Z',
    last_error: 'finance_posting_failed',
    provider_fee: 4.53,
    receipt_id: 'rc_00000000-0000-4000-8000-000000000014',
    idempotency_key: 'demo-idem-0014',
    updated_at: '2026-11-09T09:46:00.000Z',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 156.2 }],
    state_history: [
      step('created', 'created', '2026-11-09T07:00:00.000Z'),
      step('authorised', 'authorised', '2026-11-09T07:01:00.000Z'),
      step('captured', 'captured', '2026-11-09T07:03:00.000Z'),
    ],
  },
  {
    id: payId('0039'),
    older: true,
    purchase_ref: 'booking:bk_k9zd3b',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'voided',
    status_label: 'Voided',
    customer_name: 'Pyae S',
    customer_email: 'pyae.s@example.com',
    booking_reference: 'K9ZD3B',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 260,
    started_at: '2026-11-04T10:00:00.000Z',
    expires_at: '2026-11-04T10:15:00.000Z',
    authorised_at: '2026-11-04T10:01:00.000Z',
    voided_at: '2026-11-06T10:00:00.000Z',
    last_error: 'booking_confirm_failed',
    trip: 'FY214 YGN → BKK',
    idempotency_key: 'demo-idem-0039',
    lines: [{ line_type: 'fare', description: 'Fare · 1 adult', amount: 260 }],
    state_history: [
      step('created', 'created', '2026-11-04T10:00:00.000Z'),
      step('authorised', 'authorised', '2026-11-04T10:01:00.000Z'),
      step('voided', 'authorisation released', '2026-11-06T10:00:00.000Z'),
    ],
  },
]

export const MOCK_PAYMENTS: StaffPaymentDetailDto[] = MOCK_ROWS.map(toDetail)

/** The ids of the older payments, which the lookup lists only when the search finds them. */
export const OLDER_PAYMENT_IDS: ReadonlySet<string> = new Set(MOCK_ROWS.filter((row) => row.older).map((row) => row.id))
