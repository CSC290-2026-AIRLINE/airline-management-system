import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { AdminShell } from '@staff-web/features/admin-console/AdminShell'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { RefusalScreen } from '@staff-web/features/admin-console/components/RefusalScreen'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { StaffNotProvisionedScreen } from '@staff-web/features/admin-console/components/StaffNotProvisionedScreen'
import { useDeniedPreview, usePreviewMode, useUnprovisionedPreview } from '@staff-web/features/admin-console/hooks/usePreviewMode'
import { useAppAuth } from '@staff-web/auth/AuthProvider'

/**
 * Layout for the whole admin workspace, and the place both access gates live.
 *
 * The two refusal states look different on purpose, because they are different situations:
 *
 *   - **No staff account** (`RequireStaff`, previewed by `?preview=1&unprovisioned=1`) — the visitor has nothing to go
 *     anywhere, so the whole workspace is replaced: no sidebar, no header, no tabs, just the "Airlines" bar and the
 *     card. One `GET /api/me/screens` then covers all three tabs instead of one per page.
 *   - **Lacks this screen** (`?preview=1&denied=1`) — they are staff and reached a tab their role does not hold, so
 *     the sidebar stays (wordmark, the Administration link, sign-out) but the "ADMINISTRATION" heading and the tab bar
 *     go: that furniture would be claiming they are here to administer something.
 *
 * Per-screen checks stay in the pages; only their previews and the account gate need the whole layout's chrome.
 *
 * The URLs to share with reviewers are `/admin/roles?preview=1&unprovisioned=1` (no staff account — this one path
 * only, see `UNPROVISIONED_PREVIEW_PATH`) and `/admin/audit-log?preview=1&denied=1` (lacks that screen —
 * `refusedScreenName` below reads the tab off the path).
 */
export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminWorkspace,
})

/** The card names the screen that was refused. The route knows the tab from the URL even though it renders no page. */
function refusedScreenName(pathname: string): string {
  if (pathname.includes('audit-log')) return 'Audit log'
  if (pathname.includes('/roles')) return 'Role access'
  return 'Administration'
}

/**
 * The only path `?unprovisioned=1` answers on. That card replaces the entire workspace, so it is hung off the default
 * tab rather than off every admin path — one URL to share in a review, and no second one that quietly renders the same
 * thing. `/admin` redirects here, so it is also where a reviewer lands by default.
 */
const UNPROVISIONED_PREVIEW_PATH = '/admin/roles'

function AdminWorkspace() {
  const isPreview = usePreviewMode()
  const deniedPreview = useDeniedPreview() && isPreview
  const unprovisionedFlag = useUnprovisionedPreview() && isPreview
  const { user } = useAppAuth()
  const { location } = useRouterState()
  const unprovisionedPreview = unprovisionedFlag && location.pathname === UNPROVISIONED_PREVIEW_PATH

  if (unprovisionedPreview) {
    return (
      <RefusalScreen>
        <StaffNotProvisionedScreen email={user?.email} />
      </RefusalScreen>
    )
  }

  if (deniedPreview) {
    return <DeniedScreen name={refusedScreenName(location.pathname)} />
  }

  return (
    <RequireStaff>
      <AdminShell />
    </RequireStaff>
  )
}

/**
 * The sidebar-only shell plus the denied card. Its own component because `AdminShell` fills its body from `<Outlet/>`,
 * and the outlet is the very page whose contents we are replacing — so the card is handed in as `children` instead.
 */
function DeniedScreen({ name }: { name: string }) {
  return (
    <AdminShell chrome="sidebar">
      <NoAccessScreen screenName={name} roleName="Finance Staff" homeTo="/admin/roles" />
    </AdminShell>
  )
}
