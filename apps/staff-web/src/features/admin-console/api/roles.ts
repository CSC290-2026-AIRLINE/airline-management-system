import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { RoleErrorCode, RoleSummary } from '../types'

/**
 * Thrown for any non-2xx answer from `/api/admin/roles*`. The backend answers `{ error: { code, message } }`, and the
 * page switches on `code` to put the message in the right place — under the name field, under the reason field, or in
 * the dialog-level error box — so this keeps the code instead of flattening the response into a string.
 */
export class RoleApiError extends Error {
  readonly status: number
  readonly code: RoleErrorCode | `HTTP_${number}`

  constructor(status: number, code: RoleErrorCode | `HTTP_${number}`, message: string) {
    super(message)
    this.name = 'RoleApiError'
    this.status = status
    this.code = code
  }
}

export interface RolesResponse {
  roles: RoleSummary[]
}

export interface RoleScreensResponse {
  screen_ids: string[]
}

export interface ReplaceRoleScreensBody {
  screen_ids: string[]
  reason: string
}

export interface ReplaceRoleScreensResponse {
  role_id: string
  /** Sorted, de-duplicated. Use this as the new saved set — don't assume the request order survived. */
  screen_ids: string[]
  /** False means the role already held exactly these screens: nothing was written and no audit row exists. */
  changed: boolean
  /** Decimal-string `audit_log.seq` of the row this write produced. Absent when `changed` is false. */
  audit_seq?: string
}

export interface CreateRoleBody {
  name: string
  reason: string
  /** The screens the role can open from the start. Omit for a role with no assignable screens yet. */
  screen_ids?: string[]
}

export interface DeleteRoleBody {
  reason: string
}

async function readError(res: Response): Promise<RoleApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Not JSON (a proxy error page, an empty body) — fall back to the status line below.
  }
  const err = (body as { error?: { code?: string; message?: string } } | null)?.error
  if (err?.code) return new RoleApiError(res.status, err.code as RoleErrorCode, err.message ?? res.statusText)
  const message = (body as { message?: unknown } | null)?.message
  return new RoleApiError(res.status, `HTTP_${res.status}`, typeof message === 'string' ? message : res.statusText || 'Request failed')
}

/**
 * Role access endpoints. Like `useFetchJson`, the returned functions close over `fetchWithAuth`, which is recreated
 * every render — call them from event handlers or a mount effect, never list them as effect dependencies.
 */
export function useRoleApi() {
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
    list: () => send<RolesResponse>('/api/admin/roles'),
    screens: (roleId: string) => send<RoleScreensResponse>(`/api/admin/roles/${roleId}/screens`),
    replaceScreens: (roleId: string, body: ReplaceRoleScreensBody) =>
      send<ReplaceRoleScreensResponse>(`/api/admin/roles/${roleId}/screens`, { method: 'PUT', body: JSON.stringify(body) }),
    create: (body: CreateRoleBody) => send<RoleSummary>('/api/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    /** The answer is 204 with no body, so this one does not try to read JSON. */
    remove: async (roleId: string, body: DeleteRoleBody) => {
      const res = await fetchWithAuth(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw await readError(res)
    },
  }
}

/**
 * The role list, on its own. The Staff & roles page loads the roles alongside the staff list, so it takes the list
 * function rather than the whole client.
 */
export function useListRoles() {
  const api = useRoleApi()
  return api.list
}
