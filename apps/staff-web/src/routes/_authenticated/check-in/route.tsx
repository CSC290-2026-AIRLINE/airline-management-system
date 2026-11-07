import { Outlet, createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { StaffShell } from '@staff-web/features/checkin-boarding/components/StaffShell.tsx'
import { PAGE_PATHS, pageFromPath } from '@staff-web/features/checkin-boarding/components/shell-nav.ts'

/**
 * Layout for the Feature 6 staff screens: the sidebar, the page column and the account box.
 *
 * The screen is read from the URL, so a deep link lands on the right nav item, and the body comes from `<Outlet/>`.
 */
export const Route = createFileRoute('/_authenticated/check-in')({
  component: CheckInWorkspace,
})

function CheckInWorkspace() {
  const { location } = useRouterState()
  const navigate = useNavigate()
  const { user, logout } = useAppAuth()

  return (
    <StaffShell
      current={pageFromPath(location.pathname)}
      onNavigate={(page) => void navigate({ to: PAGE_PATHS[page] })}
      agentName={user?.email ?? 'Staff agent'}
      /* shortcut: real time until Feature 1 exposes the simulation clock to the frontend. */
      clock={new Date()}
      onSignOut={() => void logout()}
    >
      <Outlet />
    </StaffShell>
  )
}
