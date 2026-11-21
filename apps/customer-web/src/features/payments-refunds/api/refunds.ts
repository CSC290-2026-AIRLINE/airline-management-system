import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { MyRefundDto, MyRefundListDto, MyRefundTab, MyVoucherListDto, RefundableListDto, RefundRequestBody } from '../types'

/**
 * Feature 5b's customer API: real calls to the backend's `/api/refunds`, `/api/refunds/refundable` and `/api/vouchers`.
 * The shapes mirror the backend's `dto/payments-refunds.types.ts`.
 *
 * `fetchWithAuth` is not memoised, so the object is rebuilt each render; never put it in a dependency array.
 */

/** A readable message from the backend's error body, falling back to the status line. */
async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message
    if (message) return new Error(message)
  } catch {
    /* The body was not JSON; the status line below is enough. */
  }
  return new Error(`${res.status} ${res.statusText}`)
}

function query(params: Record<string, string>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== '') search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function useRefundsApi() {
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
    listMyRefunds: (tab: MyRefundTab, search: string) =>
      json<MyRefundListDto>('GET', `/api/refunds${query({ tab: tab === 'all' ? '' : tab, search: search.trim() })}`),

    listMyVouchers: () => json<MyVoucherListDto>('GET', '/api/vouchers'),

    /** The payments the customer can ask money back on, with what is left on each line. */
    listRefundable: () => json<RefundableListDto>('GET', '/api/refunds/refundable'),

    requestRefund: (body: RefundRequestBody) => json<MyRefundDto>('POST', '/api/refunds', body),
  }
}
