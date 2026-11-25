import type { Prisma } from '@backend/db/generated/prisma/client'

/**
 * Feature 5's side of the finance journal (`finance_posting`): which postings a money movement makes, and the one function
 * that writes them.
 *
 * A posting says what happened, when (the simulation clock) and how much, by category. It carries no account codes, so the
 * finance group can change its chart of accounts without touching Feature 5. Amounts are positive decimal strings in the
 * posting's currency; the posting type gives the direction. The builders below are pure, so a test can check exactly what
 * a movement posts; `writePostings` runs inside the movement's own transaction, and a repeat is a no-op because
 * `posting_key` is unique and the insert skips duplicates.
 *
 * Voided and failed payments post nothing, because no money moved. A zero-cash payment posts nothing either.
 */

export type PostingType =
  | 'payment_captured'
  | 'payment_provider_fee'
  | 'refund_succeeded'
  | 'refund_reversed'
  | 'voucher_issued'
  | 'voucher_redeemed'
  | 'voucher_expired'
  | 'compensation_paid'

export interface Posting {
  posting_key: string
  posting_type: PostingType
  source_type: 'payment' | 'refund' | 'compensation_voucher'
  source_id: string
  currency: string
  occurred_at: Date
  payload: { lines: { category: string; amount: string }[]; [key: string]: unknown }
}

const money = (value: number): string => (Math.round(value * 100) / 100).toFixed(2)

/** Sums amounts by category (in cents), so two lines of one kind are one row of the posting. */
function byCategory(rows: { category: string; amount: number }[]): { category: string; amount: string }[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.category, (totals.get(row.category) ?? 0) + Math.round(row.amount * 100))
  return [...totals].filter(([, cents]) => cents > 0).map(([category, cents]) => ({ category, amount: money(cents / 100) }))
}

interface CapturedPayment {
  id: string
  currency: string
  provider: string
  amount_total: number
  voucher_amount: number
  voucher_id: string | null
  provider_fee: number | null
  captured_at: Date | null
  lines: { line_type: string; amount: number }[]
}

/** What a capture posts: the lines by category, the Stripe fee (never reversed), and the voucher it used. */
export function capturedPostings(payment: CapturedPayment): Posting[] {
  // A zero-cash award booking took no money and used no voucher: nothing moved.
  if (payment.provider === 'none' && payment.voucher_amount === 0) return []
  const at = payment.captured_at ?? new Date()
  const postings: Posting[] = []
  if (payment.amount_total - payment.voucher_amount > 0) {
    postings.push({
      posting_key: `payment_captured:${payment.id}`,
      posting_type: 'payment_captured',
      source_type: 'payment',
      source_id: payment.id,
      currency: payment.currency,
      occurred_at: at,
      payload: {
        lines: byCategory(payment.lines.map((line) => ({ category: line.line_type, amount: line.amount }))),
        voucher_amount: money(payment.voucher_amount),
      },
    })
  }
  if (payment.provider_fee && payment.provider_fee > 0) {
    postings.push({
      posting_key: `payment_provider_fee:${payment.id}`,
      posting_type: 'payment_provider_fee',
      source_type: 'payment',
      source_id: payment.id,
      currency: payment.currency,
      occurred_at: at,
      payload: { lines: [{ category: 'provider_fee', amount: money(payment.provider_fee) }] },
    })
  }
  if (payment.voucher_amount > 0 && payment.voucher_id) {
    postings.push({
      posting_key: `voucher_redeemed:${payment.voucher_id}`,
      posting_type: 'voucher_redeemed',
      source_type: 'compensation_voucher',
      source_id: payment.voucher_id,
      currency: payment.currency,
      occurred_at: at,
      payload: { lines: [{ category: 'voucher', amount: money(payment.voucher_amount) }], payment_id: payment.id },
    })
  }
  return postings
}

interface SettledRefund {
  id: string
  payment_id: string
  currency: string
  reason: string
  method: string
  amount: number
  voucher_amount: number
  fee_withheld: number
  at: Date
  /** The refund's split across payment lines, as `line_type` and amount. */
  lines: { line_type: string; amount: number }[]
}

/**
 * A refund that succeeded to the card: `refund_succeeded` by line category (a cancellation fee kept goes under its own
 * category), or `compensation_paid` when it paid a compensation. A refund returned as a voucher is not cash out: its
 * voucher posts `voucher_issued` instead (see `voucherIssuedPosting`).
 */
export function refundSucceededPostings(refund: SettledRefund): Posting[] {
  const cash = refund.amount - refund.voucher_amount
  if (cash <= 0 && refund.fee_withheld <= 0) return []
  const lines = byCategory([
    ...refund.lines.map((line) => ({ category: line.line_type, amount: line.amount })),
    ...(refund.lines.length === 0 ? [{ category: 'unallocated', amount: cash }] : []),
    { category: 'cancellation_fee', amount: refund.fee_withheld },
  ])
  const compensation = refund.reason === 'compensation'
  return [
    {
      posting_key: `${compensation ? 'compensation_paid' : 'refund_succeeded'}:${refund.id}`,
      posting_type: compensation ? 'compensation_paid' : 'refund_succeeded',
      source_type: 'refund',
      source_id: refund.id,
      currency: refund.currency,
      occurred_at: refund.at,
      payload: { lines, payment_id: refund.payment_id, reason: refund.reason },
    },
  ]
}

/** A refund that succeeded and then failed late (Stripe can fail one up to 30 days on): the journal says so. */
export function refundReversedPosting(refund: Pick<SettledRefund, 'id' | 'payment_id' | 'currency' | 'amount' | 'at' | 'reason'>): Posting {
  return {
    posting_key: `refund_reversed:${refund.id}`,
    posting_type: 'refund_reversed',
    source_type: 'refund',
    source_id: refund.id,
    currency: refund.currency,
    occurred_at: refund.at,
    payload: { lines: [{ category: 'refund', amount: money(refund.amount) }], payment_id: refund.payment_id, reason: refund.reason },
  }
}

/** A voucher issued, for a compensation or a refund returned as credit. No cash moves, but the liability starts. */
export function voucherIssuedPosting(voucher: {
  id: string
  amount: number
  currency: string
  issued_at: Date
  refund_id: string | null
}): Posting {
  return {
    posting_key: `voucher_issued:${voucher.id}`,
    posting_type: 'voucher_issued',
    source_type: 'compensation_voucher',
    source_id: voucher.id,
    currency: voucher.currency,
    occurred_at: voucher.issued_at,
    payload: { lines: [{ category: 'voucher', amount: money(voucher.amount) }], refund_id: voucher.refund_id },
  }
}

/** A voucher that ran out unused: its value leaves the liability without any money moving. */
export function voucherExpiredPosting(voucher: { id: string; amount: number; currency: string; expires_at: Date }): Posting {
  return {
    posting_key: `voucher_expired:${voucher.id}`,
    posting_type: 'voucher_expired',
    source_type: 'compensation_voucher',
    source_id: voucher.id,
    currency: voucher.currency,
    occurred_at: voucher.expires_at,
    payload: { lines: [{ category: 'voucher', amount: money(voucher.amount) }] },
  }
}

/** Writes postings in the caller's transaction. A repeat (same `posting_key`) is skipped. */
export async function writePostings(tx: Prisma.TransactionClient, postings: Posting[]): Promise<void> {
  if (postings.length === 0) return
  await tx.finance_posting.createMany({
    data: postings.map((posting) => ({ ...posting, payload: posting.payload as Prisma.InputJsonValue })),
    skipDuplicates: true,
  })
}
