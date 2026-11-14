import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type {
  PaymentExceptionTab,
  PaymentProblemListDto,
  PaymentSourceFeature,
  StaffPaymentDetailDto,
  StaffPaymentFilter,
  StaffPaymentListDto,
} from '../types'

/**
 * Feature 5a's staff API: real calls to the backend's `/api/staff/payments`, `/api/staff/payment-exceptions` and the two
 * actions on it. The shapes mirror the backend's `dto/payments-checkout.types.ts`.
 *
 * `fetchWithAuth` is not memoised, so the object is rebuilt each render; never put it in a dependency array.
 */

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

/** A readable message from the backend's error body, led by the status so a 404 can be told from a failure. */
async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message
    if (message) return new Error(`${res.status} ${res.statusText}: ${message}`)
  } catch {
    /* The body was not JSON; the status line below is enough. */
  }
  return new Error(`${res.status} ${res.statusText}`)
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function usePaymentsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchWithAuth(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw await failure(res)
    return (await res.json()) as T
  }

  return {
    /** The staff payment lookup, newest first, with the counts the filter chips show. */
    listStaffPayments: (params: StaffPaymentQuery = {}) =>
      json<StaffPaymentListDto>(
        'GET',
        `/api/staff/payments${query({
          status: params.status,
          source_feature: params.source_feature,
          search: params.search?.trim(),
          limit: params.limit,
          page: params.page,
        })}`,
      ),

    /** One payment by id or by the `PAY-…` reference staff read out loud. */
    getStaffPayment: (paymentId: string) => json<StaffPaymentDetailDto>('GET', `/api/staff/payments/${encodeURIComponent(paymentId)}`),

    /** The exception list: a list of problems, with the count on each tab. */
    listPaymentProblems: (tab: PaymentExceptionTab) =>
      json<PaymentProblemListDto>('GET', `/api/staff/payment-exceptions${query({ tab: tab === 'all' ? undefined : tab })}`),

    /** Retries a capture that stalled. */
    retryCapture: (paymentId: string) =>
      json<StaffPaymentDetailDto>('POST', `/api/staff/payment-exceptions/${encodeURIComponent(paymentId)}/retry-capture`, {}),

    /** Sends a payment to the finance ledger, for a posting the ledger did not accept. */
    sendFinancePosting: (paymentId: string) =>
      json<StaffPaymentDetailDto>('POST', `/api/staff/payment-exceptions/${encodeURIComponent(paymentId)}/send-posting`, {}),
  }
}
