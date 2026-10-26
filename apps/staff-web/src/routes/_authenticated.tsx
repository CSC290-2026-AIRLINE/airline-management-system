import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { AppAuthProvider, useAppAuth } from '../auth/AuthProvider'
import { Button } from '../components/ui/button'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Separator } from '../components/ui/separator'

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

// Staff top nav: brand on the left, signed-in user + sign-out on the
// right. The Outlet below renders the matched authenticated route.
function AuthenticatedLayout() {
  return (
    <AppAuthProvider>
      <StaffNav />
      <Separator />
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </AppAuthProvider>
  )
}

function StaffNav() {
  const { user: clerkUser } = useUser()
  const { user, isLoading, logout } = useAppAuth()

  const displayName = clerkUser?.firstName ?? user?.email ?? 'Staff'
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? user?.email ?? ''

  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
        <Link to="/dashboard" className="font-heading text-base font-semibold text-foreground no-underline">
          Airline Staff Portal
        </Link>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm leading-tight hidden sm:block">
            <div className="font-medium text-foreground">{displayName}</div>
            {email && email !== displayName ? <div className="text-xs text-muted-foreground">{email}</div> : null}
          </div>
          <Button variant="outline" size="sm" onClick={() => void logout()} disabled={isLoading}>
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  )
}
