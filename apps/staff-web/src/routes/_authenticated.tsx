import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'

// TEMP-NO-LOGIN: every page opens signed out for local testing. Delete this flag and its use below before committing.
const TEMP_NO_LOGIN: boolean = true

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!TEMP_NO_LOGIN && !context.auth.isSignedIn) {
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
