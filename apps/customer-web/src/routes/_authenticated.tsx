import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'
import { ErrorBoundary } from '../components/ErrorBoundary'
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
  return (
    <AppAuthProvider>
      <AccountProvider>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </AccountProvider>
    </AppAuthProvider>
  )
}
