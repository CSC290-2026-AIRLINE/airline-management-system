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
  screen_ids: string[]
  changed: boolean
}

/**
 * PUT is wired in PR 2 — this wrapper exists so the page can already show what will be sent. The UI keeps the request
 * inert until PR 2 lands; clicking Save without a backend endpoint surfaces a clear network error.
 */
export function useReplaceRoleScreens() {
  const fetchJson = useFetchJson()
  return (roleId: string, body: ReplaceRoleScreensBody) =>
    fetchJson<ReplaceRoleScreensResponse>(`/api/admin/roles/${roleId}/screens`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
}
