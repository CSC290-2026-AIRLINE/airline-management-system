import type {
  MyRefundDto,
  MyRefundListDto,
  MyRefundTab,
  MyVoucherDto,
  MyVoucherListDto,
  RefundReceipt,
  RefundRequestBody,
  RefundRequestResult,
} from '../types'

/**
 * The customer's refunds and vouchers, in memory.
 *
 * TODO(F5b): replace every function here with a call to `GET /api/refunds`, `POST /api/refunds` and `GET /api/vouchers`.
 * The shapes already match the backend's DTOs, so only this file changes. A request sent here lasts until the page is
 * reloaded.
 */

const DAY = 24 * 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString()

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 150))

/** The receipt the request dialog is opened for until Feature 5a's receipts are in this branch. */
export const DEMO_REFUND_RECEIPT: RefundReceipt = {
  document_number: 'RCT-0042',
  booking_reference: 'K7QF2M',
  currency: 'USD',
  total: 705,
  lines: [
    { description: 'Extra baggage · 1 × 20 kg · FY214', amount: 45 },
    { description: 'Seat selection · 12A', amount: 18 },
  ],
}

const seedRefunds = (): MyRefundDto[] => [
  {
    id: 'rf_00000000-0000-4000-8000-000000000121',
    reference: 'REF-0121',
    title: 'Extra baggage',
    booking_reference: 'K7QF2M',
    amount: 45,
    currency: 'USD',
    status: 'requested',
    status_label: 'Awaiting review',
    tab: 'in_progress',
    requested_at: ago(2 * 3_600_000),
    completed_at: null,
    decided_at: null,
    outcome_note: 'Staff are reviewing this request. You will get an email when it is decided.',
    credit_note_number: null,
    voucher_code: null,
  },
  {
    id: 'rf_00000000-0000-4000-8000-000000000113',
    reference: 'REF-0113',
    title: 'Seat 12B',
    booking_reference: 'K7QF2M',
    amount: 18,
    currency: 'USD',
    status: 'succeeded',
    status_label: 'Refunded to card',
    tab: 'refunded',
    requested_at: ago(8 * DAY),
    completed_at: ago(6 * DAY),
    decided_at: null,
    outcome_note: 'Credited to Visa ending 4242. Reference RF-0113. It can take 5–10 working days to appear on your statement.',
    credit_note_number: 'CRN-0007',
    voucher_code: null,
  },
  {
    id: 'rf_00000000-0000-4000-8000-000000000098',
    reference: 'REF-0098',
    title: 'Flight FY088 cancelled',
    booking_reference: 'Q2LV8R',
    amount: 150,
    currency: 'USD',
    status: 'succeeded',
    status_label: 'Reissued as voucher',
    tab: 'refunded',
    requested_at: ago(15 * DAY),
    completed_at: ago(15 * DAY),
    decided_at: null,
    outcome_note: 'Issued as a single-use voucher you can use at checkout.',
    credit_note_number: null,
    voucher_code: 'VCH-7K2M-91QD',
  },
  {
    id: 'rf_00000000-0000-4000-8000-000000000090',
    reference: 'REF-0090',
    title: 'Upgrade',
    booking_reference: 'M3XP9D',
    amount: 30,
    currency: 'USD',
    status: 'rejected',
    status_label: 'Rejected',
    tab: 'rejected',
    requested_at: ago(40 * DAY),
    completed_at: null,
    decided_at: ago(39 * DAY),
    outcome_note: 'Outside the fare rules. Staff note: upgrade was already used on the flight.',
    credit_note_number: null,
    voucher_code: null,
  },
]

const seedVouchers = (): MyVoucherDto[] => [
  {
    id: 'vch_00000000-0000-4000-8000-00000000a001',
    code: 'VCH-7K2M-91QD',
    amount: 150,
    currency: 'USD',
    status: 'active',
    status_label: 'Active',
    description: 'Issued for cancelled flight FY088',
    issued_at: ago(15 * DAY),
    expires_at: ahead(350 * DAY),
    expires_in_days: 350,
    redeemed_at: null,
    used_on: null,
  },
  {
    id: 'vch_00000000-0000-4000-8000-00000000a002',
    code: 'VCH-3D8A-55TR',
    amount: 40,
    currency: 'USD',
    status: 'active',
    status_label: 'Expiring',
    description: 'Compensation · delay on FY102',
    issued_at: ago(16 * DAY),
    expires_at: ahead(9 * DAY),
    expires_in_days: 9,
    redeemed_at: null,
    used_on: null,
  },
  {
    id: 'vch_00000000-0000-4000-8000-00000000a003',
    code: 'VCH-1B6E-20WK',
    amount: 75,
    currency: 'USD',
    status: 'redeemed',
    status_label: 'Redeemed',
    description: 'Issued as the voucher share of a refund',
    issued_at: ago(21 * DAY),
    expires_at: ahead(344 * DAY),
    expires_in_days: null,
    redeemed_at: ago(19 * DAY),
    used_on: 'Used on booking M3XP9D',
  },
]

let refunds = seedRefunds()
let nextNumber = 124

export async function listMyRefunds(tab: MyRefundTab, search: string): Promise<MyRefundListDto> {
  await wait()
  const needle = search.trim().toLowerCase()
  const matching = refunds.filter(
    (row) => !needle || row.reference.toLowerCase().includes(needle) || row.booking_reference.toLowerCase().includes(needle),
  )
  const items = matching
    .filter((row) => tab === 'all' || row.tab === tab)
    .sort((a, b) => Date.parse(b.requested_at) - Date.parse(a.requested_at))
  return {
    items,
    total: items.length,
    counts: {
      all: matching.length,
      in_progress: matching.filter((row) => row.tab === 'in_progress').length,
      refunded: matching.filter((row) => row.tab === 'refunded').length,
      rejected: matching.filter((row) => row.tab === 'rejected').length,
    },
  }
}

export async function listMyVouchers(): Promise<MyVoucherListDto> {
  await wait()
  const items = seedVouchers()
  return { items, total: items.length, usable: items.filter((voucher) => voucher.status === 'active').length }
}

/**
 * The "Request a refund" dialog's send. A request is always queued for staff, the way the backend does it, and a second
 * one for the same item waits for the first.
 */
export async function requestRefund(receipt: RefundReceipt, body: RefundRequestBody): Promise<RefundRequestResult> {
  await wait()
  const title = body.item.split(' · ')[0]
  const open = refunds.find(
    (row) => row.booking_reference === receipt.booking_reference && row.title === title && row.tab === 'in_progress',
  )
  if (open) throw new Error(`A refund request for ${title} is already waiting for review (${open.reference}).`)
  if (body.amount > receipt.total)
    throw new Error(`You can ask for at most ${receipt.total.toFixed(2)} ${receipt.currency} on this receipt.`)

  const reference = `REF-${String(nextNumber++).padStart(4, '0')}`
  refunds = [
    {
      id: `rf_${crypto.randomUUID()}`,
      reference,
      title,
      booking_reference: receipt.booking_reference,
      amount: body.amount,
      currency: receipt.currency,
      status: 'requested',
      status_label: 'Awaiting review',
      tab: 'in_progress',
      requested_at: new Date().toISOString(),
      completed_at: null,
      decided_at: null,
      outcome_note: 'Staff are reviewing this request. You will get an email when it is decided.',
      credit_note_number: null,
      voucher_code: null,
    },
    ...refunds,
  ]
  return { reference, amount: body.amount, currency: receipt.currency, message: 'We email you when it is decided.' }
}
