import { createFileRoute, Outlet } from '@tanstack/react-router'
import AccountProvider from '@customer-web/features/Account & profile/AccountProvider'

export const Route = createFileRoute('/_authenticated/account')({
  component: AccountLayout,
  errorComponent: () => <p role="alert">We couldn’t open your profile. Please refresh and try again.</p>,
})
function AccountLayout() {
  return (
    <AccountProvider>
      <Outlet />
    </AccountProvider>
  )
}
