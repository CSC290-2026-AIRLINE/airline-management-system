import { createFileRoute, Outlet } from '@tanstack/react-router'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'

/**
 * Layout for the payment screens, and the place the account gate lives.
 *
 * The payment screens are staff screens of their own, so they sit under `/payments` rather than inside the admin
 * console. `RequireStaff` still comes first: a signed-in user with no staff account has no business on any of them.
 *
 * Per-screen checks (`f5.payment_lookup`, `f5.payment_exceptions`) stay in the pages, because only this feature knows
 * which screen code is which.
 */
export const Route = createFileRoute('/_authenticated/payments')({
  component: PaymentsWorkspace,
})

function PaymentsWorkspace() {
  return (
    <RequireStaff>
      <Outlet />
    </RequireStaff>
  )
}
