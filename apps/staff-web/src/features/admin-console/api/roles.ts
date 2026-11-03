import type { RoleSummary } from '../types'
import { useFetchJson } from './fetch'

export interface RolesResponse {
  roles: RoleSummary[]
}

export function useListRoles() {
  const fetchJson = useFetchJson()
  return () => fetchJson<RolesResponse>('/api/admin/roles')
}

export function useGetRoleScreens() {
  const fetchJson = useFetchJson()
  return (roleId: string) => fetchJson<{ screen_ids: string[] }>(`/api/admin/roles/${roleId}/screens`)
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

export function useReplaceRoleScreens() {
  const fetchJson = useFetchJson()
  return (roleId: string, body: ReplaceRoleScreensBody) =>
    fetchJson<ReplaceRoleScreensResponse>(`/api/admin/roles/${roleId}/screens`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
}
