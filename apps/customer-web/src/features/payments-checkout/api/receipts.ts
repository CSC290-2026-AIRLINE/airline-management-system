import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { ReceiptDetailDto, ReceiptFilter, ReceiptListDto } from '../types'

/**
 * Feature 5a's customer receipts API: real calls to the backend's `GET /api/receipts` and `GET /api/receipts/:id`. The
 * shapes mirror the backend's `dto/payments-checkout.types.ts`.
 *
 * `fetchWithAuth` is not memoised, so the object is rebuilt each render; never put it in a dependency array.
 */

export interface ReceiptQuery {
  /** The chip the customer picked. */
  filter?: ReceiptFilter
  /** Free text: booking reference, receipt number or a city on the route. */
  search?: string
  limit?: number
}

/** A readable message from the backend's error body, led by the status so a 404 can be told from a failure. */
export async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { message?: string | string[] }
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message
    if (message) return new Error(`${res.status} ${res.statusText}: ${message}`)
  } catch {
    /* The body was not JSON; the status line below is enough. */
  }
  return new Error(`${res.status} ${res.statusText}`)
}

export function useReceiptsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function json<T>(path: string): Promise<T> {
    const res = await fetchWithAuth(path)
    if (!res.ok) throw await failure(res)
    return (await res.json()) as T
  }

  return {
    /** The signed-in customer's receipts, newest first, with the counts the frames show on the chips. */
    listReceipts: (params: ReceiptQuery = {}) => {
      const search = new URLSearchParams()
      if (params.filter && params.filter !== 'all') search.set('filter', params.filter)
      if (params.search?.trim()) search.set('search', params.search.trim())
      if (params.limit) search.set('limit', String(params.limit))
      const text = search.toString()
      return json<ReceiptListDto>(`/api/receipts${text ? `?${text}` : ''}`)
    },

    /** One receipt. A 404 means it does not exist or is not this customer's. */
    getReceipt: (receiptId: string) => json<ReceiptDetailDto>(`/api/receipts/${encodeURIComponent(receiptId)}`),
  }
}
