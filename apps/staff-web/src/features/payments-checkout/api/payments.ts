import { MOCK_NOW, MOCK_PAYMENTS } from './mock-payments'
import type {
  PaymentExceptionState,
  PaymentExceptionTab,
  PaymentProblemDto,
  PaymentProblemListDto,
  PaymentSourceFeature,
  StaffPaymentDetailDto,
  StaffPaymentFilter,
  StaffPaymentListDto,
  StaffPaymentSummaryDto,
} from '../types'

/**
 * The mock staff payments API.
 *
 * It answers with the same shapes as the backend's `GET /api/staff/payments`, `GET /api/staff/payments/:id` and
 * `GET /api/staff/payment-exceptions`, so the pages can be written against the real contract before the API is switched
 * on.
 *
 * TODO(F5a): replace these functions with calls to the backend (`fetchWithAuth('/api/staff/payments')` and friends).
 * Nothing else in the feature changes when that happens.
 */

/** A short delay so the loading state is real rather than theoretical. */
const LATENCY_MS = 120

/** How long a payment may wait for a provider event before the staff list calls it a problem. */
const PROVIDER_EVENT_TIMEOUT_MS = 30 * 60 * 1000

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The list rows carry less than the detail page, so the detail-only fields are dropped here. */
function toSummary(payment: StaffPaymentDetailDto): StaffPaymentSummaryDto {
  const {
    idempotency_key,
    provider,
    provider_fee,
    capture_attempts,
    authorised_at,
    voided_at,
    lines,
    state_history,
    exception,
    ...summary
  } = payment
  void idempotency_key
  void provider
  void provider_fee
  void capture_attempts
  void authorised_at
  void voided_at
  void lines
  void state_history
  void exception
  return summary
}

/** True when the payment's status filter label matches. `capture_stalled` is a flag, not a status. */
function matchesStaffFilter(payment: StaffPaymentDetailDto, filter: StaffPaymentFilter): boolean {
  if (filter === 'capture_stalled') return payment.capture_stalled_at !== null
  if (filter === 'refunded') return payment.status === 'reversed'
  return payment.status === filter
}

/** The search box takes a reference, a booking, a customer or the last four digits of the card. */
function matchesSearch(payment: StaffPaymentDetailDto, search: string | undefined): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [
    payment.reference,
    payment.purchase_ref,
    payment.booking_reference,
    payment.customer_name,
    payment.customer_email,
    payment.card_last4,
  ]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle))
}

export interface StaffPaymentQuery {
  status?: StaffPaymentFilter
  source_feature?: PaymentSourceFeature
  /** Free text: reference, booking reference, customer name, customer email or card digits. */
  search?: string
  /** How many rows a page holds. */
  limit?: number
  /** Which page to read, starting at 1. */
  page?: number
}

/**
 * The staff payment lookup, newest first.
 *
 * The counts on the filter chips cover everything the search matched, not just the page on screen, so the chips stay
 * honest while a search is on.
 */
export async function listStaffPayments(query: StaffPaymentQuery = {}): Promise<StaffPaymentListDto> {
  await delay(LATENCY_MS)
  const searched = MOCK_PAYMENTS.filter((payment) => matchesSearch(payment, query.search))

  const counts: StaffPaymentListDto['counts'] = { all: searched.length, captured: 0, failed: 0, capture_stalled: 0, voided: 0, refunded: 0 }
  for (const payment of searched) {
    if (payment.status === 'captured') counts.captured += 1
    if (payment.status === 'failed') counts.failed += 1
    if (payment.capture_stalled_at !== null) counts.capture_stalled += 1
    if (payment.status === 'voided') counts.voided += 1
    if (payment.status === 'reversed') counts.refunded += 1
  }

  const filtered = searched
    .filter((payment) => query.status === undefined || matchesStaffFilter(payment, query.status))
    .filter((payment) => query.source_feature === undefined || payment.source_feature === query.source_feature)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  const pageSize = query.limit ?? 10
  const page = query.page ?? 1
  const items = filtered.slice((page - 1) * pageSize, page * pageSize).map(toSummary)
  return { items, total: filtered.length, counts }
}

/**
 * Finds a payment by its id or by the reference staff read out loud.
 *
 * The deep links carry the reference (`PAY-20261109-0006`), because that is the number on the screen, and the actions
 * carry the id, because that is what the API takes. Both find the same row — the backend's `requirePayment` falls back
 * to the reference the same way.
 */
function findPayment(paymentId: string): StaffPaymentDetailDto | undefined {
  const needle = paymentId.trim().toLowerCase()
  return MOCK_PAYMENTS.find((payment) => payment.id.toLowerCase() === needle || payment.reference.toLowerCase() === needle)
}

/** One payment, with the capture-stalled panel and the state history the staff frames show. */
export async function getStaffPayment(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = findPayment(paymentId)
  if (!payment) {
    throw new Error(`404 Not Found: Payment ${paymentId} not found`)
  }
  return payment
}

/**
 * The problem a payment is, if it is one.
 *
 * A payment that is simply in flight is not a problem, so it is not on the list. Mirrors the backend's `problemFor`.
 */
function problemFor(payment: StaffPaymentDetailDto, now: Date): PaymentProblemDto | null {
  if (payment.capture_stalled_at) {
    const cargo = payment.source_feature === 17
    return {
      id: payment.id,
      type: cargo ? 'cargo_capture_stalled' : 'ticket_capture_stalled',
      title: cargo ? 'Cargo capture stalled' : 'Ticket capture stalled',
      reference: payment.reference,
      booking_reference: payment.booking_reference,
      what_happened: cargo
        ? 'The cargo booking is confirmed, but the card has not been charged. No Air Waybill is issued until it is.'
        : 'The booking is confirmed and the ticket is live, but the card has not been charged.',
      what_to_do: cargo
        ? 'Retry the capture. If it keeps failing, cancel the cargo booking.'
        : 'Retry the capture. If it keeps failing, decide whether to cancel the ticket.',
      action: 'retry_capture',
      action_label: 'Retry capture',
      since: payment.capture_stalled_at,
      state: 'needs_action',
      payment_id: payment.id,
    }
  }

  if (payment.last_error === 'finance_posting_failed') {
    return {
      id: payment.id,
      type: 'finance_posting_delayed',
      title: 'Finance posting delayed',
      reference: payment.reference,
      booking_reference: payment.booking_reference,
      what_happened: 'The finance ledger did not answer (503). The payment itself is complete.',
      what_to_do: 'Send the payment to the finance ledger now.',
      action: 'send_posting',
      action_label: 'Send now',
      since: payment.started_at,
      state: 'queued',
      payment_id: payment.id,
    }
  }

  if (payment.exception?.resolution === 'posted') {
    return {
      id: payment.id,
      type: 'finance_posting_delayed',
      title: 'Finance posting delayed',
      reference: payment.reference,
      booking_reference: payment.booking_reference,
      what_happened: 'The finance ledger did not answer (503). The payment itself is complete.',
      what_to_do: 'No action — the payment is in the ledger.',
      action: 'none',
      action_label: null,
      since: payment.exception.detected_at,
      state: 'resolved',
      payment_id: payment.id,
    }
  }

  if (payment.status === 'voided' && payment.last_error === 'booking_confirm_failed') {
    return {
      id: payment.id,
      type: 'authorisation_voided',
      title: 'Authorisation voided',
      reference: payment.reference,
      booking_reference: payment.booking_reference,
      what_happened: 'The card was authorised, but the booking confirm failed twice. The hold was released automatically.',
      what_to_do: 'No action — the customer was not charged.',
      action: 'none',
      action_label: null,
      since: payment.voided_at ?? payment.started_at,
      state: 'resolved',
      payment_id: payment.id,
    }
  }

  const waitingForProvider =
    payment.status === 'authorised' &&
    payment.capture_attempts === 0 &&
    now.getTime() - new Date(payment.started_at).getTime() > PROVIDER_EVENT_TIMEOUT_MS
  if (waitingForProvider) {
    return {
      id: payment.id,
      type: 'waiting_for_provider',
      title: 'Waiting for the provider',
      reference: payment.reference,
      booking_reference: payment.booking_reference,
      what_happened: 'No provider event for 30 minutes.',
      what_to_do: 'Nothing yet — the reconciliation job is checking.',
      action: 'none',
      action_label: null,
      since: payment.started_at,
      state: 'queued',
      payment_id: payment.id,
    }
  }

  return null
}

/**
 * The staff exception list — a list of problems, not a list of payments.
 *
 * - `needs_action` — a person has to decide now.
 * - `queued` — a job or a retry is already running; nothing to do yet.
 * - `resolved` — it is closed, and stays on the record.
 * - `all` — every one of those.
 */
export async function listPaymentProblems(tab: PaymentExceptionTab): Promise<PaymentProblemListDto> {
  await delay(LATENCY_MS)
  const now = new Date(MOCK_NOW)
  const rows = MOCK_PAYMENTS.map((payment) => problemFor(payment, now)).filter((row): row is PaymentProblemDto => row !== null)

  const counts: Record<PaymentExceptionState | 'all', number> = { all: rows.length, needs_action: 0, queued: 0, resolved: 0 }
  for (const row of rows) counts[row.state] += 1

  const filtered = rows.filter((row) => tab === 'all' || row.state === tab).sort((a, b) => Date.parse(b.since) - Date.parse(a.since))
  return { items: filtered, total: filtered.length, counts }
}

/**
 * Retries a capture that stalled.
 *
 * TODO(F5a): call `POST /api/staff/payment-exceptions/:id/retry-capture` instead.
 */
export async function retryCapture(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = findPayment(paymentId)
  if (!payment) {
    throw new Error(`404 Not Found: Payment ${paymentId} not found`)
  }
  if (payment.status !== 'authorised') {
    throw new Error(`409 Conflict: Only an authorised payment can be captured; ${paymentId} is ${payment.status}`)
  }

  const now = new Date(MOCK_NOW)
  payment.capture_attempts += 1
  payment.status = 'captured'
  payment.status_label = 'Captured'
  payment.captured_at = now.toISOString()
  payment.capture_stalled_at = null
  payment.last_error = null
  payment.provider_fee = Math.round(payment.card_amount * 0.029 * 100) / 100
  payment.receipt_id = `rc_mock_${payment.id.slice(-6)}`
  payment.state_history = [...payment.state_history, { key: 'captured', label: 'captured', at: now.toISOString() }]
  payment.exception = {
    state: 'resolved',
    detected_at: payment.exception?.detected_at ?? now.toISOString(),
    resolved_at: now.toISOString(),
    resolved_by: 'staff_demo',
    resolution: 'captured',
    note: payment.exception?.note ?? null,
  }
  return payment
}

/**
 * Sends a payment to the finance ledger, for a posting the ledger did not accept.
 *
 * TODO(F5a): call `POST /api/staff/payment-exceptions/:id/send-posting` instead.
 */
export async function sendFinancePosting(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = findPayment(paymentId)
  if (!payment) {
    throw new Error(`404 Not Found: Payment ${paymentId} not found`)
  }
  if (payment.last_error !== 'finance_posting_failed') {
    throw new Error(`409 Conflict: Payment ${paymentId} is not waiting on the finance ledger`)
  }

  const now = new Date(MOCK_NOW)
  payment.last_error = null
  payment.exception = {
    state: 'resolved',
    detected_at: payment.exception?.detected_at ?? now.toISOString(),
    resolved_at: now.toISOString(),
    resolved_by: 'staff_demo',
    resolution: 'posted',
    note: payment.exception?.note ?? null,
  }
  return payment
}
