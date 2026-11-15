import { useAppAuth } from '@customer-web/auth/AuthProvider'

// Prisma sends NUMERIC columns as strings ("150.00"); the payments API already formats them that way.
type Money = string

export type PaymentStatus = 'created' | 'authorised' | 'captured' | 'failed' | 'voided' | 'expired' | 'reversed'
export type RefundStatus = 'requested' | 'pending_approval' | 'approved' | 'processing' | 'succeeded' | 'failed' | 'rejected'
export type VoucherStatus = 'active' | 'redeemed' | 'expired' | 'cancelled'

export interface PaymentLine {
  id: string
  line_type: string
  description: string
  amount: Money
  refunded_amount: Money
}

export interface Payment {
  id: string
  status: PaymentStatus
  source_feature: number
  purchase_ref: string
  provider: 'stripe' | 'fake' | 'none'
  currency: string
  amount_total: Money
  voucher_amount: Money
  card_amount: Money
  voucher_code: string | null
  lines: PaymentLine[]
  card_brand: string | null
  card_last4: string | null
  booking_reference: string | null
  cargo_booking_ref: string | null
  awb_number: string | null
  miles_used: number | null
  receipt: { id: string; document_number: string; document_type: string } | null
  expires_at: string
  seconds_left: number
  captured_at: string | null
  capture_stalled_at: string | null
  last_error: string | null
  started_at: string
}

export interface CheckoutResult {
  payment: Payment
  checkout_url: string | null
}

export interface VoucherCheck {
  code: string
  amount: Money
  currency: string
  expires_at: string
  applied_amount: Money
  forfeited_amount: Money
}

export interface CheckoutPreview {
  label: string
  source_feature: number
  payable: boolean
  miles_booking: boolean
  expires_at: string
  currency: string
  lines: { line_type: string; description: string; amount: Money }[]
  amount_total: Money
  voucher: VoucherCheck | null
  voucher_amount: Money
  card_amount: Money
  live_payment: { id: string; status: PaymentStatus } | null
}

export interface Receipt {
  document_type: 'receipt' | 'invoice'
  document_number: string
  issued_at: string
  billing_name: string | null
  amount: Money
  payment: Payment
  credit_notes: { document_number: string; amount: Money; issued_at: string; refund_id: string }[]
}

export interface Refund {
  id: string
  payment_id: string
  reason: string
  method: 'original' | 'voucher'
  status: RefundStatus
  amount: Money
  voucher_amount: Money
  fee_withheld: Money
  decision_note: string | null
  failure_reason: string | null
  requested_at: string
  completed_at: string | null
  payment: { purchase_ref: string; currency: string; booking?: { booking_reference: string } | null }
  refund_line?: { id: string; amount: Money; payment_line: { line_type: string; description: string; amount: Money } }[]
  receipt?: { document_number: string; issued_at: string } | null
  compensation_voucher?: { code: string; status: VoucherStatus } | null
}

export interface Voucher {
  id: string
  code: string
  amount: Money
  currency: string
  status: VoucherStatus
  issued_at: string
  expires_at: string
  redeemed_at: string | null
}

export interface FakeSession {
  session_id: string
  payment_id: string
  amount_cents: number
  currency: string
  description: string
  state: 'open' | 'complete' | 'expired'
  cancel_url: string
}

export type FakeOutcome = 'success' | 'decline' | 'slow' | 'capture_fails' | 'cancel'

/** Error body of every payments endpoint: { error: { code, message } }; ValidationPipe errors carry message: string[]. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

async function readResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => null)) as { message?: string | string[]; error?: { code?: string; message?: string } } | null
  if (!res.ok) {
    const message =
      data?.error?.message ?? (Array.isArray(data?.message) ? data.message.join('; ') : data?.message) ?? `Request failed (${res.status})`
    throw new ApiError(message, res.status, data?.error?.code)
  }
  return data as T
}

/** Calls go through AuthProvider's fetchWithAuth (token + refresh). No caching: TanStack Query replaces this later. */
export function usePaymentsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: { ...headers, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }
    return readResponse<T>(await fetchWithAuth(`/api${path}`, init))
  }

  return {
    previewCheckout: (bookingReference: string, voucherCode?: string) =>
      request<CheckoutPreview>('/checkout/preview', 'POST', {
        booking_reference: bookingReference,
        ...(voucherCode && { voucher_code: voucherCode }),
      }),
    checkout: (bookingReference: string, idempotencyKey: string, voucherCode?: string) =>
      request<CheckoutResult>(
        '/checkout',
        'POST',
        { booking_reference: bookingReference, ...(voucherCode && { voucher_code: voucherCode }) },
        { 'Idempotency-Key': idempotencyKey },
      ),
    validateVoucher: (code: string, bookingReference?: string) =>
      request<VoucherCheck>('/vouchers/validate', 'POST', { code, ...(bookingReference && { booking_reference: bookingReference }) }),
    newAttempt: (paymentId: string) => request<CheckoutResult>(`/payments/${paymentId}/attempts`, 'POST'),
    getPayment: (paymentId: string) => request<Payment>(`/payments/${paymentId}`),
    getReceipt: (paymentId: string) => request<Receipt>(`/payments/${paymentId}/receipt`),
    myPayments: () => request<Payment[]>('/customers/me/payments'),
    myRefunds: () => request<Refund[]>('/customers/me/refunds'),
    getRefund: (refundId: string) => request<Refund>(`/refunds/${refundId}`),
    requestRefund: (paymentId: string, note: string, paymentLineId?: string) =>
      request<Refund>('/refund-requests', 'POST', {
        payment_id: paymentId,
        note,
        ...(paymentLineId && { payment_line_id: paymentLineId }),
      }),
    myVouchers: () => request<Voucher[]>('/customers/me/vouchers'),
    fakeSession: (sessionId: string) => request<FakeSession>(`/payments/fake-provider/sessions/${encodeURIComponent(sessionId)}`),
    completeFakeSession: (sessionId: string, outcome: FakeOutcome) =>
      request<{ redirect: string }>(`/payments/fake-provider/sessions/${encodeURIComponent(sessionId)}/complete`, 'POST', { outcome }),
  }
}
