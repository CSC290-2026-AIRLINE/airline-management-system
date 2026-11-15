import { useAppAuth } from '@staff-web/auth/AuthProvider'

type Money = string

export type PaymentStatus = 'created' | 'authorised' | 'captured' | 'failed' | 'voided' | 'expired' | 'reversed'
export type RefundStatus = 'requested' | 'pending_approval' | 'approved' | 'processing' | 'succeeded' | 'failed' | 'rejected'
export type VoucherStatus = 'active' | 'redeemed' | 'expired' | 'cancelled'
export type StaffRefundReason = 'customer_request' | 'staff_adjustment' | 'rebook_difference'

export interface PaymentLine {
  id: string
  line_type: string
  description: string
  booking_coupon_id: string | null
  amount: Money
  refunded_amount: Money
}

export interface PaymentAttempt {
  id: string
  provider_session_id: string
  provider_intent_id: string | null
  status: string
  failure_code: string | null
  card_brand: string | null
  card_last4: string | null
  created_at: string
  updated_at: string
}

export interface PaymentEvent {
  provider_event_id: string
  event_type: string
  received_at: string
  processed_at: string | null
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
  payer: { id: string; name: string } | null
  miles_used: number | null
  receipt: { id: string; document_number: string; document_type: string } | null
  started_at: string
  expires_at: string
  authorised_at: string | null
  captured_at: string | null
  voided_at: string | null
  capture_stalled_at: string | null
  capture_attempts: number
  last_error: string | null
}

export interface RefundRow {
  id: string
  payment_id: string
  source_key: string
  reason: string
  method: 'original' | 'voucher'
  status: RefundStatus
  amount: Money
  voucher_amount: Money
  fee_withheld: Money
  provider_refund_id: string | null
  audit_log_id: string | null
  decision_note: string | null
  failure_reason: string | null
  requested_at: string
  completed_at: string | null
  updated_at: string
  case_compensation_id: string | null
}

export interface PaymentDetail extends Payment {
  attempts: PaymentAttempt[]
  events: PaymentEvent[]
  refunds: (RefundRow & { refund_line: { payment_line_id: string; amount: Money }[] })[]
}

export interface QueueRefund extends RefundRow {
  payment: {
    id: string
    currency: string
    purchase_ref: string
    booking: { booking_reference: string } | null
    customer: { passenger: { first_name: string; last_name: string } } | null
  }
}

export interface RefundDetail extends RefundRow {
  refund_line: { id: string; amount: Money; payment_line: { line_type: string; description: string; amount: Money } }[]
  payment: {
    id: string
    status: PaymentStatus
    currency: string
    purchase_ref: string
    amount_total: Money
    voucher_amount: Money
    booking: { id: string; booking_reference: string } | null
  }
  receipt: { document_number: string; issued_at: string } | null
  compensation_voucher: { code: string; status: VoucherStatus } | null
  audit_log: { id: string; occurred_at: string; actor_role: string | null; reason: string | null } | null
  policy: { within: boolean; policy_amount: Money; checked_in: boolean }
}

export interface StaffVoucher {
  id: string
  code: string
  customer_id: string
  amount: Money
  currency: string
  status: VoucherStatus
  case_compensation_id: string | null
  refund_id: string | null
  issued_at: string
  expires_at: string
  redeemed_at: string | null
  cancel_reason: string | null
  customer: { id: string; passenger: { first_name: string; last_name: string } }
}

export interface PendingCompensation {
  id: string
  type: 'voucher' | 'refund'
  amount: Money
  reason: string
  decided_at: string
  complaint_case: { case_number: string; customer_id: string | null; contact_email: string | null }
  payments: { id: string; purchase_ref: string; currency: string; refundable: Money; booking: { booking_reference: string } | null }[]
}

export interface Exceptions {
  stalled_captures: (Omit<Payment, 'lines' | 'payer'> & {
    booking: { booking_reference: string } | null
    cargo_booking_payment_cargo_booking_idTocargo_booking: { booking_ref: string } | null
  })[]
  failed_refunds: (RefundRow & {
    payment: { id: string; currency: string; purchase_ref: string; booking: { booking_reference: string } | null }
  })[]
  /** Crew pay (5c): payouts the provider refused, to retry. */
  failed_payouts: {
    id: string
    amount: Money
    failure_reason: string | null
    created_at: string
    crew: { first_name: string; last_name: string; role: string; employee_number: string }
    pay_run: { id: string; period_start: string; period_end: string }
  }[]
}

export interface StaffRefundInput {
  payment_id: string
  reason: StaffRefundReason
  method: 'original' | 'voucher'
  amount: number
  payment_line_id?: string
  waive_fee?: boolean
  note: string
}

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

/** Calls go through AuthProvider's fetchWithAuth. No caching here: TanStack Query replaces this once it is set up. */
export function usePaymentsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown): Promise<T> {
    return readResponse<T>(
      await fetchWithAuth(`/api${path}`, {
        method,
        ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    )
  }

  return {
    searchPayments: (q: string) => request<Payment[]>(`/staff/payments?q=${encodeURIComponent(q.trim())}`),
    getPayment: (id: string) => request<PaymentDetail>(`/payments/${id}`),
    retryCapture: (id: string) => request<{ ok: boolean; error?: string; payment: Payment }>(`/staff/payments/${id}/retry-capture`, 'POST'),
    listRefunds: (status?: RefundStatus) => request<QueueRefund[]>(`/staff/refunds${status ? `?status=${status}` : ''}`),
    getRefund: (id: string) => request<RefundDetail>(`/refunds/${id}`),
    createRefund: (input: StaffRefundInput) =>
      request<{ refund: RefundRow; needs_approval: boolean; policy: RefundDetail['policy'] }>('/staff/refunds', 'POST', input),
    decideRefund: (id: string, action: 'approve' | 'reject' | 'reissue_voucher', note: string) =>
      request<RefundRow>(`/staff/refunds/${id}`, 'PUT', { action, note }),
    pendingCompensations: () => request<PendingCompensation[]>('/staff/compensations'),
    payCompensation: (input: { case_compensation_id: string; form: 'refund' | 'voucher'; payment_id?: string; amount?: number }) =>
      request<{ form: string; payout_ref: string }>('/staff/compensations', 'POST', input),
    listVouchers: (status?: VoucherStatus, code?: string) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (code?.trim()) params.set('code', code.trim())
      const query = params.toString()
      return request<StaffVoucher[]>(`/staff/vouchers${query ? `?${query}` : ''}`)
    },
    cancelVoucher: (id: string, reason: string) => request<StaffVoucher>(`/staff/vouchers/${id}`, 'PUT', { reason }),
    exceptions: () => request<Exceptions>('/staff/payment-exceptions'),
    retryPayout: (id: string) => request<{ status: string; failure_reason: string | null }>(`/staff/payouts/${id}/retry`, 'POST'),
  }
}
