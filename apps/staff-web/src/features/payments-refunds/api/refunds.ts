import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type {
  CompensationEntryDto,
  CompensationFilter,
  CompensationListDto,
  IssueCompensationBody,
  RefundDecision,
  RefundDetailDto,
  RefundQueueListDto,
  RefundQueueTab,
} from '../types'

/**
 * Feature 5b's staff API: real calls to the backend's `/api/staff/refunds`, `/api/staff/compensation` and
 * `/api/staff/vouchers/:id/void`. The shapes mirror the backend's `dto/payments-refunds.types.ts`.
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

  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    return fetchWithAuth(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async function json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await send(method, path, body)
    if (!res.ok) throw await failure(res)
    return (await res.json()) as T
  }

  return {
    listRefundQueue: (tab: RefundQueueTab, search: string) =>
      json<RefundQueueListDto>('GET', `/api/staff/refunds${query({ tab: tab === 'all' ? '' : tab, search: search.trim() })}`),

    /** One refund, or null when there is none with that id or reference. */
    async getRefund(idOrReference: string): Promise<RefundDetailDto | null> {
      const res = await send('GET', `/api/staff/refunds/${encodeURIComponent(idOrReference)}`)
      if (res.status === 404) return null
      if (!res.ok) throw await failure(res)
      return (await res.json()) as RefundDetailDto
    },

    decideRefund: (idOrReference: string, decision: RefundDecision, reason: string) =>
      json<RefundDetailDto>('POST', `/api/staff/refunds/${encodeURIComponent(idOrReference)}/decision`, { decision, reason }),

    listCompensation: (filter: CompensationFilter, search: string) =>
      json<CompensationListDto>(
        'GET',
        `/api/staff/compensation${query({ filter: filter === 'all' ? '' : filter, search: search.trim() })}`,
      ),

    issueCompensation: (body: IssueCompensationBody) => json<CompensationEntryDto>('POST', '/api/staff/compensation', body),

    voidVoucher: (id: string, reason?: string) =>
      json<CompensationEntryDto>('POST', `/api/staff/vouchers/${encodeURIComponent(id)}/void`, reason ? { reason } : {}),
  }
}
