import { createFileRoute } from '@tanstack/react-router'
import { AdminShell } from '@staff-web/features/admin-console/AdminShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/**
 * Layout for the whole admin workspace, and the place the account gate lives.
 *
 * The gate replaces the entire workspace: a visitor with no staff account has nothing to go anywhere, so they get no
 * sidebar, no header, no tabs — just the "Airlines" bar and the card. One `GET /api/me/screens` then covers all three
 * tabs instead of one call per page.
 *
 * Per-screen checks stay in the pages; only the account gate needs the whole layout's chrome.
 */
export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminWorkspace,
})

function AdminWorkspace() {
  return (
    <RequireStaff>
      <AdminShell />
    </RequireStaff>
  )
}
