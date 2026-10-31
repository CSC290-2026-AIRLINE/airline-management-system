import type { ReactNode } from 'react'
import { useScreenAccess } from '../hooks/useScreenAccess'
import { RefusalScreen } from './RefusalScreen'
import { StaffNotProvisionedScreen } from './StaffNotProvisionedScreen'

interface RequireStaffProps {
  /** The page. Not rendered at all until the account is known to exist. */
  children: ReactNode
  /**
   * Shown while `GET /api/me/screens` is in flight. Defaults to a one-line muted message. Pass the feature's own
   * skeleton here if it has one, so the swap does not flash a different layout.
   */
  loadingFallback?: ReactNode
}

/**
 * Wraps a page so a signed-in user with no staff account never reaches it — they get
 * `StaffNotProvisionedScreen` instead, which tells them to ask an Admin for an account rather than showing an empty
 * page or a 403 they cannot act on.
 *
 * One line per feature route:
 *
 * ```tsx
 * export const Route = createFileRoute('/_authenticated/refunds')({
 *   component: () => (
 *     <RequireStaff>
 *       <RefundsPage />
 *     </RequireStaff>
 *   ),
 * })
 * ```
 *
 * Two deliberate behaviours:
 *
 *   - **A failed check does not lock anyone out.** `useScreenAccess` reports `provisioned: null` when the request
 *     errors, and this renders `children` on null. A network blip must not tell a real staff member to go ask an admin
 *     for an account they already have — the page's own fetch surfaces the error anyway.
 *   - **It does not check individual screens.** That is `canOpen` plus `NoAccessScreen`, and only your feature knows
 *     which screen code it is. Do the per-screen check *after* this one.
 */
export function RequireStaff({ children, loadingFallback }: RequireStaffProps) {
  const { loading, provisioned } = useScreenAccess()

  if (loading) return <>{loadingFallback ?? <p className="p-6 text-sm text-muted-foreground">Checking your access…</p>}</>
  /* `RefusalScreen` supplies the chrome above the card, not the card itself — whatever replaces the shell owns the
     frame. */
  if (provisioned === false) {
    return (
      <RefusalScreen>
        <StaffNotProvisionedScreen />
      </RefusalScreen>
    )
  }
  return <>{children}</>
}
