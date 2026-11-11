import type { RefundDecision, RefundDetailDto, RefundQueueListDto, RefundQueueTab, RefundSummaryDto } from '../types'

/**
 * The refund queue, in memory.
 *
 * TODO(F5b): replace every function here with a call to `GET /api/staff/refunds`, `GET /api/staff/refunds/:id` and
 * `POST /api/staff/refunds/:id/decision`. The shapes already match the backend's DTOs, so only this file changes.
 * Decisions last until the page is reloaded.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function detail(
  partial: Partial<RefundDetailDto> & Pick<RefundDetailDto, 'id' | 'reference' | 'booking_reference' | 'amount'>,
): RefundDetailDto {
  return {
    source_label: 'Customer request',
    currency: 'USD',
    status: 'requested',
    status_label: 'Needs review',
    queue_tab: 'needs_review',
    requested_at: ago(2 * HOUR),
    method: 'original',
    voucher_amount: 0,
    fee_withheld: 0,
    item: '',
    customer_reason: null,
    paid_by: `Card 4242 (${partial.amount.toFixed(2)}) · no voucher`,
    fare_rule: { outcome: 'inside', label: 'Inside rules', note: 'This request is inside the fare rules.' },
    needs_override: false,
    decision: null,
    provider_refund_id: null,
    voucher_code: null,
    credit_note_number: null,
    ...partial,
  }
}

const seed = (): RefundDetailDto[] => [
  detail({
    id: 'rf_00000000-0000-4000-8000-000000000121',
    reference: 'REF-0121',
    booking_reference: 'K7QF2M',
    amount: 45,
    item: 'Extra baggage · 1 × 20 kg · FY214',
    customer_reason: 'I no longer need the extra baggage.',
    fare_rule: {
      outcome: 'inside',
      label: 'Inside rules',
      note: 'This request is inside the fare rules, but baggage was already checked in online, so it came here for review.',
    },
  }),
  detail({
    id: 'rf_00000000-0000-4000-8000-000000000122',
    reference: 'REF-0122',
    booking_reference: 'R5NH7C',
    amount: 210,
    source_label: 'Outside fare rules',
    requested_at: ago(3 * HOUR),
    item: 'Fare · 1 adult · FY214',
    customer_reason: 'Family emergency, travel no longer possible.',
    fare_rule: {
      outcome: 'outside',
      label: 'Outside rules (non-refundable fare)',
      note: 'A refund outside the fare rules needs an override. The override and your name are logged in the audit trail (feature 15).',
    },
    needs_override: true,
  }),
  detail({
    id: 'rf_00000000-0000-4000-8000-000000000123',
    reference: 'REF-0123',
    booking_reference: 'T9WE2L',
    amount: 0,
    source_label: 'Rebook difference',
    requested_at: ago(5 * HOUR),
    item: 'Fare difference · rebooked flight',
    paid_by: 'Card 4242 (0.00) · no voucher',
    fare_rule: {
      outcome: 'inside',
      label: 'Inside rules',
      note: 'The rebooked flight costs the same, so there is nothing to return unless staff decide otherwise.',
    },
  }),
  detail({
    id: 'rf_00000000-0000-4000-8000-000000000113',
    reference: 'REF-0113',
    booking_reference: 'K7QF2M',
    amount: 18,
    status: 'succeeded',
    status_label: 'Refunded',
    queue_tab: 'done',
    requested_at: ago(8 * DAY),
    item: 'Seat 12B',
    customer_reason: 'The seat does not recline.',
    provider_refund_id: 'RF-0113',
    credit_note_number: 'CRN-0007',
    decision: { decided_at: ago(6 * DAY), decided_by: 'Staff demo', note: 'Approved.', override: false },
  }),
  detail({
    id: 'rf_00000000-0000-4000-8000-000000000098',
    reference: 'REF-0098',
    booking_reference: 'Q2LV8R',
    amount: 150,
    source_label: 'Flight cancelled',
    status: 'succeeded',
    status_label: 'Voucher issued',
    queue_tab: 'done',
    method: 'voucher',
    voucher_amount: 150,
    requested_at: ago(15 * DAY),
    item: 'Flight FY088 cancelled',
    voucher_code: 'VCH-7K2M-91QD',
    decision: { decided_at: ago(15 * DAY), decided_by: 'System', note: 'Flight cancelled. Reissued as a voucher.', override: false },
  }),
]

let rows = seed()

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 150))

function summary(r: RefundDetailDto): RefundSummaryDto {
  return {
    id: r.id,
    reference: r.reference,
    booking_reference: r.booking_reference,
    source_label: r.source_label,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    status_label: r.status_label,
    queue_tab: r.queue_tab,
    requested_at: r.requested_at,
  }
}

export async function listRefundQueue(tab: RefundQueueTab, search: string): Promise<RefundQueueListDto> {
  await wait()
  const needle = search.trim().toLowerCase()
  const matching = rows.filter(
    (r) => !needle || r.reference.toLowerCase().includes(needle) || r.booking_reference.toLowerCase().includes(needle),
  )
  const items = matching.filter((r) => tab === 'all' || r.queue_tab === tab).map(summary)
  return {
    items,
    total: items.length,
    counts: {
      all: matching.length,
      needs_review: matching.filter((r) => r.queue_tab === 'needs_review').length,
      done: matching.filter((r) => r.queue_tab === 'done').length,
    },
  }
}

export async function getRefund(idOrReference: string): Promise<RefundDetailDto | null> {
  await wait()
  return rows.find((r) => r.id === idOrReference || r.reference === idOrReference) ?? null
}

export async function decideRefund(idOrReference: string, decision: RefundDecision, reason: string): Promise<RefundDetailDto> {
  await wait()
  const current = rows.find((r) => r.id === idOrReference || r.reference === idOrReference)
  if (!current) throw new Error('Refund not found.')
  if (current.queue_tab !== 'needs_review') throw new Error('This refund has already been decided.')

  const record = {
    decided_at: new Date().toISOString(),
    decided_by: 'You',
    note: reason,
    override: decision !== 'reject' && current.needs_override,
  }
  let next: RefundDetailDto
  if (decision === 'approve_card') {
    next = {
      ...current,
      status: 'processing',
      status_label: 'Paying to card',
      queue_tab: 'done',
      provider_refund_id: `RF-${current.reference.slice(4)}`,
      decision: record,
    }
  } else if (decision === 'approve_voucher') {
    next = {
      ...current,
      status: 'succeeded',
      status_label: 'Voucher issued',
      queue_tab: 'done',
      method: 'voucher',
      voucher_amount: current.amount,
      voucher_code: 'VCH-NEW1-0000',
      decision: record,
    }
  } else {
    next = { ...current, status: 'rejected', status_label: 'Rejected', queue_tab: 'done', decision: record }
  }
  rows = rows.map((r) => (r.id === current.id ? next : r))
  return next
}
