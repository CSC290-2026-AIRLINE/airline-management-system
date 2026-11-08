import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'
import { FlythonHeader } from '../components/FlythonHeader'

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
      <FlythonHeader />
      <Outlet />
    </AppAuthProvider>
  )
}
