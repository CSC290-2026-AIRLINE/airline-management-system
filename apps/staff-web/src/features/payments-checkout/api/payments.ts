import { MOCK_NOW, MOCK_PAYMENTS } from './mock-payments'
import type {
  ListDto,
  PaymentExceptionState,
  PaymentExceptionTab,
  PaymentSourceFeature,
  StaffPaymentDetailDto,
  StaffPaymentFilter,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The list rows carry less than the detail page, so the detail-only fields are dropped here. */
function toSummary(payment: StaffPaymentDetailDto): StaffPaymentSummaryDto {
  const { idempotency_key, provider, provider_fee, capture_attempts, authorised_at, voided_at, lines, exception, ...summary } = payment
  void idempotency_key
  void provider
  void provider_fee
  void capture_attempts
  void authorised_at
  void voided_at
  void lines
  void exception
  return summary
}

/** True when the payment's status filter label matches. `capture_stalled` is a flag, not a status. */
function matchesStaffFilter(payment: StaffPaymentDetailDto, filter: StaffPaymentFilter): boolean {
  if (filter === 'capture_stalled') return payment.capture_stalled_at !== null
  if (filter === 'refunded') return payment.status === 'reversed'
  return payment.status === filter
}

/**
 * Where a payment sits on the exception list.
 *
 * Mirrors the backend's `exceptionStateFor`: a settled payment is not an exception, however long ago its deadline was.
 */
function exceptionStateFor(payment: StaffPaymentDetailDto, now: Date): PaymentExceptionState | null {
  if (payment.exception?.state === 'resolved') return 'resolved'
  const stillOpen = payment.status === 'created' || payment.status === 'authorised'
  if (!stillOpen) return null
  if (payment.capture_stalled_at !== null || now > new Date(payment.expires_at)) return 'needs_action'
  return 'queued'
}

export interface StaffPaymentQuery {
  status?: StaffPaymentFilter
  source_feature?: PaymentSourceFeature
  limit?: number
}

/** The staff payment lookup, newest first. */
export async function listStaffPayments(query: StaffPaymentQuery = {}): Promise<ListDto<StaffPaymentSummaryDto>> {
  await delay(LATENCY_MS)
  const rows = MOCK_PAYMENTS.filter((payment) => query.status === undefined || matchesStaffFilter(payment, query.status))
    .filter((payment) => query.source_feature === undefined || payment.source_feature === query.source_feature)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())

  const items = rows.slice(0, query.limit ?? 50).map(toSummary)
  return { items, total: rows.length }
}

/** One payment, with the capture-stalled panel the staff frames show. */
export async function getStaffPayment(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = MOCK_PAYMENTS.find((p) => p.id === paymentId)
  if (!payment) {
    throw new Error(`404 Not Found: Payment ${paymentId} not found`)
  }
  return payment
}

/**
 * The staff exception list.
 *
 * - `needs_action` — the capture stalled, or the deadline passed while the payment was open.
 * - `queued` — the payment is in flight and still inside its deadline.
 * - `resolved` — the payment was on the list and has since been closed.
 * - `all` — every one of those.
 */
export async function listPaymentExceptions(tab: PaymentExceptionTab): Promise<ListDto<StaffPaymentSummaryDto>> {
  await delay(LATENCY_MS)
  const now = new Date(MOCK_NOW)
  const rows = MOCK_PAYMENTS.map((payment) => ({ payment, state: exceptionStateFor(payment, now) }))
    .filter((row): row is { payment: StaffPaymentDetailDto; state: PaymentExceptionState } => row.state !== null)
    .filter((row) => tab === 'all' || row.state === tab)
    .sort((a, b) => new Date(b.payment.started_at).getTime() - new Date(a.payment.started_at).getTime())

  const items = rows.map((row) => toSummary(row.payment))
  return { items, total: items.length }
}

/**
 * Retries a capture that stalled.
 *
 * TODO(F5a): call `POST /api/staff/payments/:id/retry-capture` instead.
 */
export async function retryCapture(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = MOCK_PAYMENTS.find((p) => p.id === paymentId)
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
 * Voids an authorised payment, releasing the authorisation without charging.
 *
 * TODO(F5a): call `POST /api/staff/payments/:id/void` instead.
 */
export async function voidPayment(paymentId: string): Promise<StaffPaymentDetailDto> {
  await delay(LATENCY_MS)
  const payment = MOCK_PAYMENTS.find((p) => p.id === paymentId)
  if (!payment) {
    throw new Error(`404 Not Found: Payment ${paymentId} not found`)
  }
  if (payment.status !== 'authorised') {
    throw new Error(`409 Conflict: Only an authorised payment can be voided; ${paymentId} is ${payment.status}`)
  }

  const now = new Date(MOCK_NOW)
  payment.status = 'voided'
  payment.status_label = 'Voided'
  payment.voided_at = now.toISOString()
  payment.last_error = 'voided_by_staff'
  payment.exception = {
    state: 'resolved',
    detected_at: payment.exception?.detected_at ?? now.toISOString(),
    resolved_at: now.toISOString(),
    resolved_by: 'staff_demo',
    resolution: 'voided',
    note: payment.exception?.note ?? null,
  }
  return payment
}
