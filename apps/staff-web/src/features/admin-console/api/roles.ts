import { useFetchJson } from './fetch'
import type { RoleSummary } from '../types'

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
  /** The screens the role can open from the start. Omit it for a role with no assignable screens yet. */
  screen_ids?: string[]
}

export interface DeleteRoleBody {
  reason: string
}

/**
 * Role access endpoints.
 *
 * Every call goes through the shared `useFetchJson`, so a failure comes back as one `ApiError` — the same one the
 * screen, audit and "my screens" clients throw — carrying the status and the server's error code. The pages read that
 * code to decide where the message goes: under the name field, under the reason field, or in the dialog-level box.
 *
 * The returned functions close over `fetchWithAuth`, which is recreated every render — call them from event handlers or
 * a mount effect, never list them as effect dependencies.
 */
export function useRoleApi() {
  const fetchJson = useFetchJson()

  return {
    list: () => fetchJson<RolesResponse>('/api/admin/roles'),
    screens: (roleId: string) => fetchJson<RoleScreensResponse>(`/api/admin/roles/${roleId}/screens`),
    replaceScreens: (roleId: string, body: ReplaceRoleScreensBody) =>
      fetchJson<ReplaceRoleScreensResponse>(`/api/admin/roles/${roleId}/screens`, { method: 'PUT', body: JSON.stringify(body) }),
    create: (body: CreateRoleBody) => fetchJson<RoleSummary>('/api/admin/roles', { method: 'POST', body: JSON.stringify(body) }),
    /** The answer is 204 with no body, so this one has nothing to read back. */
    remove: (roleId: string, body: DeleteRoleBody) =>
      fetchJson<void>(`/api/admin/roles/${roleId}`, { method: 'DELETE', body: JSON.stringify(body) }),
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
