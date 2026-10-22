import { useEffect, useState } from 'react'
import type { RoleSummary, RoleScreensResponse, ScreenGroup } from '../types'

interface UseRoleAccessState {
  loading: boolean
  error: string | null
  screens: ScreenGroup[]
  roles: RoleSummary[]
  /** screen_ids saved for the currently-selected role */
  granted: Set<string>
}

/**
 * Loads the screens + roles registry once, plus the saved grants for the selected role. Owns the "pending edits"
 * state so the page body stays declarative. The dirty flag is derived on the page side — there is no separate
 * `dirty: boolean`.
 *
 * No `setState` is called inside an effect body. The role-id-driven re-fetch runs from the input id via the fetch
 * effect below; here we lean on the dependency list.
 *
 * Pass `enabled=false` to skip all API calls — `?preview=1` mode on the page uses this to keep the live API out of
 * the picture entirely while the page renders from `preview-data.ts`.
 */
export function useRoleAccess(
  roleId: string | null,
  listScreens: () => Promise<{ groups: ScreenGroup[] }>,
  listRoles: () => Promise<{ roles: RoleSummary[] }>,
  getRoleScreens: (id: string) => Promise<RoleScreensResponse>,
  enabled: boolean = true,
) {
  const [state, setState] = useState<UseRoleAccessState>({
    loading: enabled,
    error: null,
    screens: [],
    roles: [],
    granted: new Set(),
  })
  const [loadedRoleId, setLoadedRoleId] = useState<string | null>(null)

  // Static-ish parts — screens + roles registry.
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, error: null, screens: [], roles: [], granted: new Set() })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [s, r] = await Promise.all([listScreens(), listRoles()])
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: null, screens: s.groups, roles: r.roles }))
      } catch (e: unknown) {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: e instanceof Error ? e.message : String(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // The three fetchers come from React hooks via useFetchJson. They are recreated each render but never change in
    // identity between renders in practice (they only close over the stable `fetchWithAuth`). Ignoring them on
    // purpose keeps this effect self-contained.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Per-role grants reload whenever `roleId` changes. `loadedRoleId` tracks which role's grants are in
  // `state.granted` so we can detect a desync on the next render and trigger a fetch.
  if (roleId !== loadedRoleId) {
    if (roleId === null) {
      // Clear immediately when the user deselects. Render-time setState is the official pattern.
      setLoadedRoleId(null)
      setState((prev) => (prev.granted.size === 0 ? prev : { ...prev, granted: new Set() }))
    } else {
      setLoadedRoleId(roleId)
    }
  }

  useEffect(() => {
    if (!enabled) return
    if (!roleId || loadedRoleId !== roleId) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await getRoleScreens(roleId)
        if (cancelled) return
        setState((prev) => ({ ...prev, granted: new Set(r.screen_ids) }))
      } catch (e: unknown) {
        if (cancelled) return
        setState((prev) => ({ ...prev, error: e instanceof Error ? e.message : String(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roleId, loadedRoleId])

  /**
   * Adopt the server's answer as the new saved set, right after a successful `PUT /admin/roles/:id/screens`. The
   * response already carries the authoritative de-duplicated `screen_ids`, so refetching would only add a round trip
   * and a window where the checkboxes flash the stale set.
   *
   * The `roleId` argument is checked against `loadedRoleId` so a response that lands after the admin has switched
   * roles cannot overwrite the newly-selected role's grants with the previous role's.
   */
  function setGranted(roleId: string, screenIds: string[]): void {
    if (roleId !== loadedRoleId) return
    setState((prev) => ({ ...prev, granted: new Set(screenIds) }))
  }

  return { ...state, setGranted }
}
