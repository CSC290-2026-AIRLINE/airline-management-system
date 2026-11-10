import type { PaymentLineDto, PaymentSourceFeature, PaymentStateStepDto, PaymentStatus, StaffPaymentDetailDto } from '../types'

/**
 * The demo payments the mock staff API serves.
 *
 * They are the same rows the backend seeds (`buildSeedPayments()` in
 * `apps/backend/src/modules/payments-checkout/payment.repository.ts`), so both sides of the mock tell the same story: a
 * captured card payment, a booking paid with miles and cash, an award booking with no cash at all, a cargo invoice, a
 * refunded booking, three captures that stalled, a declined card, an expired hold, a voided authorisation and one that
 * is still waiting for the customer.
 *
 * The dates are fixed rather than relative to "now", so the lists do not reorder themselves while you are looking at
 * them.
 *
 * TODO(F5a): delete this file when the staff payment list comes from `GET /api/staff/payments`.
 */

/** The clock the mock reads. Fixed, so the exception tabs always show the same rows. */
export const MOCK_NOW = '2026-11-09T10:00:00.000Z'

const CUSTOMER_ID = 'c0000000-0000-4000-8000-0000000000c1'
const CUSTOMER_NAME = 'Demo Customer'
const CUSTOMER_EMAIL = 'demo.customer@flython.aero'

/** The fields every row carries that the backend derives rather than stores. */
interface MockRow {
  id: string
  purchase_ref: string
  source_feature: PaymentSourceFeature
  source_feature_label: string
  status: PaymentStatus
  status_label: string
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
  receipt_id?: string | null
  idempotency_key: string
  lines: PaymentLineDto[]
  exception?: StaffPaymentDetailDto['exception']
  state_history: PaymentStateStepDto[]
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

/** Fills in the fields the backend derives, so a row only spells out what is really its own. */
function toDetail(row: MockRow): StaffPaymentDetailDto {
  const voucherAmount = row.voucher_amount ?? 0
  const cardAmount = Math.round((row.amount_total - voucherAmount) * 100) / 100
  return {
    id: row.id,
    reference: reference(row.id, row.started_at),
    purchase_ref: row.purchase_ref,
    source_feature: row.source_feature,
    source_feature_label: row.source_feature_label,
    status: row.status,
    status_label: row.status_label,
    payer_customer_id: CUSTOMER_ID,
    customer_name: CUSTOMER_NAME,
    customer_email: CUSTOMER_EMAIL,
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
    idempotency_key: row.idempotency_key,
    provider: row.provider ?? 'fake',
    provider_fee: row.provider_fee ?? null,
    capture_attempts: row.capture_attempts ?? 0,
    authorised_at: row.authorised_at ?? null,
    voided_at: row.voided_at ?? null,
    lines: row.lines,
    state_history: row.state_history,
    exception: row.exception ?? null,
  }
}

const MOCK_ROWS: MockRow[] = [
  {
    id: 'pay_00000000-0000-4000-8000-000000000010',
    purchase_ref: 'booking:bk_1d7c40',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'created',
    status_label: 'Created',
    booking_reference: 'FLY1GH',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 512.4,
    started_at: '2026-11-09T09:58:00.000Z',
    expires_at: '2026-11-09T10:13:00.000Z',
    idempotency_key: 'demo-idem-10',
    lines: [{ line_type: 'fare', description: 'Flight DEN → SAN, 1 passenger', amount: 512.4 }],
    state_history: [{ key: 'created', label: 'created', at: '2026-11-09T09:58:00.000Z' }],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000006',
    purchase_ref: 'booking:bk_5c8e21',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Capture stalled',
    booking_reference: 'FLY5EF',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 233.4,
    started_at: '2026-11-09T09:20:00.000Z',
    expires_at: '2026-11-09T09:35:00.000Z',
    authorised_at: '2026-11-09T09:22:00.000Z',
    confirmed_at: '2026-11-09T09:25:00.000Z',
    capture_stalled_at: '2026-11-09T09:30:00.000Z',
    capture_attempts: 5,
    last_error: 'capture_retry_limit_reached',
    idempotency_key: 'demo-idem-6',
    lines: [{ line_type: 'fare', description: 'Flight LAX → ORD, 1 passenger', amount: 233.4 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-09T09:20:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-09T09:22:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-09T09:25:00.000Z' },
      { key: 'stalled', label: 'capture stalled', at: '2026-11-09T09:30:00.000Z' },
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-09T09:30:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 5 times: capture_retry_limit_reached',
    },
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000011',
    purchase_ref: 'booking:bk_2c8f55',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Capture stalled',
    booking_reference: 'FLY2GH',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 342.1,
    started_at: '2026-11-09T09:35:00.000Z',
    expires_at: '2026-11-09T09:50:00.000Z',
    authorised_at: '2026-11-09T09:37:00.000Z',
    confirmed_at: '2026-11-09T09:39:00.000Z',
    capture_stalled_at: '2026-11-09T09:48:00.000Z',
    capture_attempts: 5,
    last_error: 'capture_retry_limit_reached',
    idempotency_key: 'demo-idem-11',
    lines: [{ line_type: 'fare', description: 'Flight BKK → KIX, 1 passenger', amount: 342.1 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-09T09:35:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-09T09:37:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-09T09:39:00.000Z' },
      { key: 'stalled', label: 'capture stalled', at: '2026-11-09T09:48:00.000Z' },
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-09T09:48:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 5 times: capture_retry_limit_reached',
    },
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000012',
    purchase_ref: 'cargo_booking:cb_3a77c1',
    source_feature: 17,
    source_feature_label: 'Cargo',
    status: 'authorised',
    status_label: 'Capture stalled',
    booking_reference: 'CGO-3A77C1',
    card_brand: 'Visa',
    card_last4: '1881',
    amount_total: 820,
    started_at: '2026-11-09T08:50:00.000Z',
    expires_at: '2026-11-09T09:20:00.000Z',
    authorised_at: '2026-11-09T08:52:00.000Z',
    confirmed_at: '2026-11-09T08:54:00.000Z',
    capture_stalled_at: '2026-11-09T09:10:00.000Z',
    capture_attempts: 5,
    last_error: 'capture_retry_limit_reached',
    idempotency_key: 'demo-idem-12',
    lines: [
      { line_type: 'cargo_freight', description: 'Cargo freight — 30 kg', amount: 720 },
      { line_type: 'cargo_surcharge', description: 'Oversize surcharge', amount: 100 },
    ],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-09T08:50:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-09T08:52:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-09T08:54:00.000Z' },
      { key: 'stalled', label: 'capture stalled', at: '2026-11-09T09:10:00.000Z' },
    ],
    exception: {
      state: 'needs_action',
      detected_at: '2026-11-09T09:10:00.000Z',
      resolved_at: null,
      resolved_by: null,
      resolution: null,
      note: 'Capture failed 5 times: capture_retry_limit_reached',
    },
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000013',
    purchase_ref: 'booking:bk_4e1d92',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'authorised',
    status_label: 'Authorised',
    booking_reference: 'FLY4GH',
    card_brand: 'Visa',
    card_last4: '1881',
    amount_total: 268.9,
    started_at: '2026-11-09T09:28:00.000Z',
    expires_at: '2026-11-09T10:12:00.000Z',
    authorised_at: '2026-11-09T09:29:00.000Z',
    confirmed_at: '2026-11-09T09:30:00.000Z',
    idempotency_key: 'demo-idem-13',
    lines: [{ line_type: 'fare', description: 'Flight BKK → SGN, 1 passenger', amount: 268.9 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-09T09:28:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-09T09:29:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-09T09:30:00.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000007',
    purchase_ref: 'check_in:ci_44bb07:bags:2',
    source_feature: 6,
    source_feature_label: 'Excess baggage',
    status: 'failed',
    status_label: 'Failed',
    booking_reference: 'FLY5EF',
    amount_total: 70,
    started_at: '2026-11-07T10:00:00.000Z',
    expires_at: '2026-11-07T10:15:00.000Z',
    last_error: 'card_declined',
    idempotency_key: 'demo-idem-7',
    lines: [{ line_type: 'baggage', description: '2 excess checked bags', amount: 70 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-07T10:00:00.000Z' },
      { key: 'failed', label: 'card declined', at: '2026-11-07T10:01:00.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000014',
    purchase_ref: 'booking:bk_6b0a44',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
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
    idempotency_key: 'demo-idem-14',
    lines: [{ line_type: 'fare', description: 'Flight BKK → DMK, 1 passenger', amount: 156.2 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-09T07:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-09T07:01:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-09T07:02:00.000Z' },
      { key: 'captured', label: 'captured', at: '2026-11-09T07:03:00.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000002',
    purchase_ref: 'booking:bk_2a44c0',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    booking_reference: 'FLY2CD',
    card_brand: 'Mastercard',
    card_last4: '5100',
    miles_redeemed: 40000,
    amount_total: 58.2,
    started_at: '2026-11-06T10:00:00.000Z',
    expires_at: '2026-11-06T10:15:00.000Z',
    authorised_at: '2026-11-06T10:00:45.000Z',
    confirmed_at: '2026-11-06T10:01:00.000Z',
    captured_at: '2026-11-06T10:01:10.000Z',
    provider_fee: 1.69,
    receipt_id: 'rc_00000000-0000-4000-8000-000000000002',
    idempotency_key: 'demo-idem-2',
    lines: [{ line_type: 'fare', description: 'Flight SFO → JFK, 1 passenger — 40,000 miles', amount: 58.2 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-06T10:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-06T10:00:45.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-06T10:01:00.000Z' },
      { key: 'captured', label: 'captured', at: '2026-11-06T10:01:10.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000009',
    purchase_ref: 'product_order:po_88c2a0',
    source_feature: 12,
    source_feature_label: 'Onboard sale',
    status: 'voided',
    status_label: 'Voided',
    amount_total: 18.5,
    started_at: '2026-11-04T10:00:00.000Z',
    expires_at: '2026-11-04T10:10:00.000Z',
    authorised_at: '2026-11-04T10:00:30.000Z',
    voided_at: '2026-11-04T10:01:30.000Z',
    last_error: 'booking_confirm_failed',
    idempotency_key: 'demo-idem-9',
    lines: [{ line_type: 'onboard_order', description: 'Onboard order — 1 item', amount: 18.5 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-04T10:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-04T10:00:30.000Z' },
      { key: 'voided', label: 'authorisation released', at: '2026-11-04T10:01:30.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000008',
    purchase_ref: 'booking:bk_6f1d99',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'expired',
    status_label: 'Expired',
    booking_reference: 'FLY8LA',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 189,
    started_at: '2026-11-05T10:00:00.000Z',
    expires_at: '2026-11-05T10:15:00.000Z',
    last_error: 'hold_expired',
    idempotency_key: 'demo-idem-8',
    lines: [{ line_type: 'fare', description: 'Flight SEA → MIA, 1 passenger', amount: 189 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-05T10:00:00.000Z' },
      { key: 'expired', label: 'hold expired', at: '2026-11-05T10:15:00.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000001',
    purchase_ref: 'booking:bk_7f3a91',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    booking_reference: 'FLY3AB',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 412.6,
    started_at: '2026-11-03T08:00:00.000Z',
    expires_at: '2026-11-03T08:15:00.000Z',
    authorised_at: '2026-11-03T08:01:00.000Z',
    confirmed_at: '2026-11-03T08:01:20.000Z',
    captured_at: '2026-11-03T08:01:30.000Z',
    provider_fee: 11.97,
    receipt_id: 'rc_00000000-0000-4000-8000-000000000001',
    idempotency_key: 'demo-idem-1',
    lines: [{ line_type: 'fare', description: 'Flight SFO → JFK, 1 passenger', amount: 412.6 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-11-03T08:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-11-03T08:01:00.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-11-03T08:01:20.000Z' },
      { key: 'captured', label: 'captured', at: '2026-11-03T08:01:30.000Z' },
    ],
    exception: {
      state: 'resolved',
      detected_at: '2026-11-03T08:01:10.000Z',
      resolved_at: '2026-11-03T08:01:30.000Z',
      resolved_by: 'staff_demo',
      resolution: 'captured',
      note: 'The capture failed twice; the third attempt succeeded.',
    },
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000004',
    purchase_ref: 'cargo_booking:cb_9d10ff',
    source_feature: 17,
    source_feature_label: 'Cargo',
    status: 'captured',
    status_label: 'Captured',
    booking_reference: 'CGO-9D10FF',
    card_brand: 'Visa',
    card_last4: '1881',
    amount_total: 1284.75,
    started_at: '2026-10-31T15:00:00.000Z',
    expires_at: '2026-10-31T15:30:00.000Z',
    authorised_at: '2026-10-31T15:00:40.000Z',
    confirmed_at: '2026-10-31T15:00:55.000Z',
    captured_at: '2026-10-31T15:01:05.000Z',
    provider_fee: 37.26,
    receipt_id: 'rc_00000000-0000-4000-8000-000000000004',
    idempotency_key: 'demo-idem-4',
    lines: [
      { line_type: 'cargo_freight', description: 'Cargo freight — 42 kg', amount: 1184.75 },
      { line_type: 'cargo_surcharge', description: 'Oversize surcharge', amount: 100 },
    ],
    state_history: [
      { key: 'created', label: 'created', at: '2026-10-31T15:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-10-31T15:00:40.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-10-31T15:00:55.000Z' },
      { key: 'captured', label: 'captured', at: '2026-10-31T15:01:05.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000003',
    purchase_ref: 'booking:bk_0b12c3',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'captured',
    status_label: 'Captured',
    booking_reference: 'FLY0BC',
    miles_redeemed: 25000,
    amount_total: 0,
    started_at: '2026-10-29T09:00:00.000Z',
    expires_at: '2026-10-29T09:15:00.000Z',
    authorised_at: '2026-10-29T09:00:30.000Z',
    confirmed_at: '2026-10-29T09:00:40.000Z',
    captured_at: '2026-10-29T09:00:50.000Z',
    receipt_id: 'rc_00000000-0000-4000-8000-000000000003',
    idempotency_key: 'demo-idem-3',
    lines: [{ line_type: 'award_fee', description: 'Award ticket — 25,000 miles, no taxes due', amount: 0 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-10-29T09:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-10-29T09:00:30.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-10-29T09:00:40.000Z' },
      { key: 'captured', label: 'captured', at: '2026-10-29T09:00:50.000Z' },
    ],
  },
  {
    id: 'pay_00000000-0000-4000-8000-000000000005',
    purchase_ref: 'booking:bk_3e5f44',
    source_feature: 3,
    source_feature_label: 'Flight booking',
    status: 'reversed',
    status_label: 'Refunded',
    booking_reference: 'FLY3EF',
    card_brand: 'Visa',
    card_last4: '4242',
    amount_total: 305.4,
    started_at: '2026-10-26T11:00:00.000Z',
    expires_at: '2026-10-26T11:15:00.000Z',
    authorised_at: '2026-10-26T11:00:55.000Z',
    confirmed_at: '2026-10-26T11:01:10.000Z',
    captured_at: '2026-10-26T11:01:20.000Z',
    provider_fee: 8.86,
    receipt_id: 'rc_00000000-0000-4000-8000-000000000005',
    idempotency_key: 'demo-idem-5',
    lines: [{ line_type: 'fare', description: 'Flight BOS → MIA, 1 passenger', amount: 305.4 }],
    state_history: [
      { key: 'created', label: 'created', at: '2026-10-26T11:00:00.000Z' },
      { key: 'authorised', label: 'authorised', at: '2026-10-26T11:00:55.000Z' },
      { key: 'confirmed', label: 'booking confirmed', at: '2026-10-26T11:01:10.000Z' },
      { key: 'captured', label: 'captured', at: '2026-10-26T11:01:20.000Z' },
    ],
  },
]

export const MOCK_PAYMENTS: StaffPaymentDetailDto[] = MOCK_ROWS.map(toDetail)
