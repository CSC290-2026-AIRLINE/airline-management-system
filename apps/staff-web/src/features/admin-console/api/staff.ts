import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { StaffErrorCode, StaffListResponse, StaffRow } from '../types'

/**
 * Thrown for any non-2xx answer from `/api/admin/staff*`. The backend answers `{ error: { code, message } }`, and the
 * page switches on `code` to put the message in the right place, so this keeps the code instead of flattening the
 * response into a string the way `useFetchJson` does.
 */
export class StaffApiError extends Error {
  readonly status: number
  readonly code: StaffErrorCode | `HTTP_${number}`

  constructor(status: number, code: StaffErrorCode | `HTTP_${number}`, message: string) {
    super(message)
    this.name = 'StaffApiError'
    this.status = status
    this.code = code
  }
}

export interface StaffCreateBody {
  first_name: string
  last_name: string
  email: string
  role_id: string
  reason: string
}

/** The whole Edit dialog in one request; the backend works out what changed. */
export type StaffUpdateBody = StaffCreateBody

export interface StaffStatusBody {
  active: boolean
  reason: string
}

async function readError(res: Response): Promise<StaffApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Not JSON (a proxy error page, an empty body) — fall back to the status line below.
  }
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error
  if (err?.code) return new StaffApiError(res.status, err.code as StaffErrorCode, err.message ?? res.statusText)
  const message = (body as { message?: unknown } | null)?.message
  return new StaffApiError(res.status, `HTTP_${res.status}`, typeof message === 'string' ? message : res.statusText || 'Request failed')
}

/**
 * Staff endpoints. Like `useFetchJson`, the returned functions close over `fetchWithAuth`, which is recreated every
 * render — call them from event handlers or a mount effect, never list them as effect dependencies.
 */
export function useStaffApi() {
  const { fetchWithAuth } = useAppAuth()

  async function send<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) throw await readError(res)
    return (await res.json()) as T
  }

  return {
    list: () => send<StaffListResponse>('/api/admin/staff'),
    create: (body: StaffCreateBody) => send<StaffRow>('/api/admin/staff', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: StaffUpdateBody) => send<StaffRow>(`/api/admin/staff/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    setStatus: (id: string, body: StaffStatusBody) =>
      send<StaffRow>(`/api/admin/staff/${id}/status`, { method: 'PUT', body: JSON.stringify(body) }),
  }
}
