import { Navigate, Outlet, useRouterState } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { StaffNotProvisionedScreen } from '@staff-web/features/admin-console/components/StaffNotProvisionedScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { BI_VIEWS, viewFromPath } from '../bi-views'
import { BiErrorBoundary } from '../components/BiErrorBoundary'
import { BiWorkspace } from '../components/BiWorkspace'

/**
 * The `/bi` layout. Each view is its own route under it (`/bi/operations`, `/bi/finance`, ...), so a view loads only
 * its own data. Shows only the views the signed-in role holds (Feature 15 screen access); the API checks the same
 * screens, so hiding a view is not the protection. `/bi` itself opens the first view the role can see.
 */
export function BiLayout() {
  const auth = useAppAuth()
  const access = useScreenAccess()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const hash = useRouterState({ select: (state) => state.location.hash })
  const views = BI_VIEWS.filter((view) => access.canOpen(view.screen))
  const current = viewFromPath(pathname)

  if (access.loading) return <p className="p-6 text-sm text-muted-foreground">Checking your access…</p>
  if (access.provisioned === false) return <StaffNotProvisionedScreen email={auth.user?.email} />
  if (access.error) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Could not check your access ({access.error}). Reload the page to try again.
      </p>
    )
  }
  if (views.length === 0) return <NoAccessScreen screenName="Business intelligence" roleName={access.role?.name} recorded={false} />

  if (!current) {
    // Links saved before the views had their own URLs used the hash (`/bi#finance`); they still open that view.
    const target = views.find((view) => view.id === hash.replace(/^#/, '')) ?? views[0]
    return <Navigate to={target.path} replace />
  }
  if (!views.includes(current)) return <NoAccessScreen screenName={current.label} roleName={access.role?.name} recorded={false} />

  return (
    <BiWorkspace view={current.id} views={views}>
      {/* Keyed by view, so a view that failed shows again after moving to another tab and back. */}
      <BiErrorBoundary key={current.id} label={current.label}>
        <Outlet />
      </BiErrorBoundary>
    </BiWorkspace>
  )
}
