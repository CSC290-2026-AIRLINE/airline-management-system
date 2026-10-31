import { useFetchJson } from './fetch'

/** Response shape for `GET /api/me/screens`. `screen_codes` is the public identifier, not the UUID — other features
 * match their own nav against these strings. */
export interface MyScreensResponse {
  screen_codes: string[]
  /**
   * `false` when the signed-in user has no staff account yet. Never infer this from an empty `screen_codes` — a real
   * staff member whose role holds no screens returns the same empty list, and telling that person to go ask an admin
   * for an account they already have would be worse than showing them nothing.
   */
  provisioned: boolean
}

/**
 * One-shot fetch of the signed-in user's accessible screens. The corresponding stateful hook (loading/error/codes)
 * lives in `hooks/useMyScreens.ts` so this file stays a thin wrapper that matches `api/screens.ts` and `api/roles.ts`.
 *
 * No admin guard on the route — `/api/me/screens` is reachable for any signed-in user. See
 * `apps/backend/src/modules/admin-console/me.controller.ts`.
 */
export function useListMyScreens() {
  const fetchJson = useFetchJson()
  return () => fetchJson<MyScreensResponse>('/api/me/screens')
}
