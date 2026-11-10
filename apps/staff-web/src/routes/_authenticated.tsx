import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AppAuthProvider>
      <Outlet />
    </AppAuthProvider>
  )
}
