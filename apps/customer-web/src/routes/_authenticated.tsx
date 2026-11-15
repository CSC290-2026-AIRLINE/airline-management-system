import { createFileRoute, Outlet, redirect, useLocation } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'
import AccountProvider from '@customer-web/features/passenger-profiles/AccountProvider'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const isBaggageCase = useLocation({ select: (location) => location.pathname.replace(/\/+$/, '') === '/lost-bag-case' })

  return (
    <AppAuthProvider>
      {isBaggageCase ? (
        <Outlet />
      ) : (
        <AccountProvider>
          <Outlet />
        </AccountProvider>
      )}
    </AppAuthProvider>
  )
}
