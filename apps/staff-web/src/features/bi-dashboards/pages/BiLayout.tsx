import { Navigate, Outlet, useChildMatches, useRouterState } from '@tanstack/react-router'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { StaffNotProvisionedScreen } from '@staff-web/features/admin-console/components/StaffNotProvisionedScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { BI_VIEWS, viewFromRouteId } from '../bi-views'
import { BiErrorBoundary } from '../components/BiErrorBoundary'
import { BiWorkspace } from '../components/BiWorkspace'
import { KPI_GRID, WORKSPACE } from '../lib-styles'

/**
 * The `/bi` layout. Each view is its own route under it (`/bi/operations`, `/bi/finance`, ...), so a view loads only
 * its own data. Shows only the views the signed-in role holds (Feature 15 screen access); the API checks the same
 * screens, so hiding a view is not the protection. `/bi` itself opens the first view the role can see.
 */
export function BiLayout() {
  const auth = useAppAuth()
  const access = useScreenAccess()
  // The view comes from the child route this layout is rendering, not from the address bar: on a click to another
  // page the address changes before this layout unmounts, and reading it then sent the user back to `/bi`.
  const childRouteId = useChildMatches({ select: (matches) => matches[0]?.routeId as string | undefined })
  const hash = useRouterState({ select: (state) => state.location.hash })
  const views = BI_VIEWS.filter((view) => access.canOpen(view.screen))
  const current = viewFromRouteId(childRouteId)

  if (access.loading) {
    // The page's outline while access is checked, so a direct load does not show an empty page first.
    return (
      <div className={WORKSPACE} aria-busy="true">
        <span className="sr-only">Checking your access…</span>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className={KPI_GRID}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[124px]" />
          ))}
        </div>
      </div>
    )
  }
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
    // No child route: the address is `/bi` itself. Links saved before the views had their own URLs used the hash
    // (`/bi#finance`); they still open that view.
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
