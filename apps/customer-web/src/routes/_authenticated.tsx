import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    const isGuestComplaintFlow =
      location.pathname.startsWith('/complaints') &&
      (location.searchStr.includes('guest=1') || sessionStorage.getItem('f13_guest_mode') === '1')

    if (!context.auth.isSignedIn && !isGuestComplaintFlow) {
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
      <Outlet />
    </AppAuthProvider>
  )
}
