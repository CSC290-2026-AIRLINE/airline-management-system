import { useMyScreens } from './useMyScreens'

export interface UseScreenAccess {
  /** True until `GET /api/me/screens` resolves. Render a neutral loading state, never a 403, while this is true. */
  loading: boolean
  error: string | null
  /** Every screen code the signed-in user can open. */
  codes: string[]
  /**
   * Whether the signed-in user has a staff account at all — `null` while loading, or if the request failed. When it is
   * `false`, show `StaffNotProvisionedScreen` instead of any per-screen check: the user cannot be denied a screen they
   * were never provisioned to begin with.
   */
  provisioned: boolean | null
  /**
   * Whether the user may open `code`. Always false while `loading` — checking too early would flash the
   * access-denied screen at somebody who does in fact have the screen.
   */
  canOpen: (code: string) => boolean
}

/**
 * Thin wrapper over `useMyScreens` that turns the flat list of codes into the two questions a feature actually asks:
 * "is this person staff at all?" and "can they open my screen?". Import this from a feature route instead of calling
 * the API yourself.
 *
 * The codes come from `GET /api/me/screens`, which applies the whole policy — `core` screens for everyone, `admin`
 * screens for `is_admin` roles, `assignable` screens only with a `role_screen` grant. This hook does not re-implement
 * any of that, so a policy change on the server needs no client change.
 *
 * ```tsx
 * const { loading, provisioned, canOpen } = useScreenAccess()
 * if (loading) return <p className="muted">Checking your access…</p>
 * if (!provisioned) return <StaffNotProvisionedScreen />
 * if (!canOpen('f07.refunds')) return <NoAccessScreen screenName="Refunds" />
 * ```
 *
 * Granting is done by an admin on the Role access tab (`PUT /admin/roles/:id/screens`) — see `contracts/README.md`.
 */
export function useScreenAccess(): UseScreenAccess {
  const { loading, error, codes, provisioned } = useMyScreens()
  return {
    loading,
    error,
    codes,
    provisioned,
    // `codes.includes` rather than a Set: the list is tens of entries and this runs during render.
    canOpen: (code: string) => !loading && codes.includes(code),
  }
}
