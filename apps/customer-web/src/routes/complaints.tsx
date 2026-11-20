import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppAuthProvider } from '../auth/AuthProvider'

export const Route = createFileRoute('/complaints')({
  component: ComplaintsLayout,
})

function ComplaintsLayout() {
  return (
    <AppAuthProvider>
      <Outlet />
    </AppAuthProvider>
  )
}
