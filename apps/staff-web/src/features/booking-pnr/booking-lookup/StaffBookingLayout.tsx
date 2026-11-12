import type { ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@staff-web/components/ui/sidebar'
import { AppSidebar } from '@staff-web/features/admin-console/components/AppSidebar'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { useMyAccess } from '@staff-web/features/admin-console/components/MyAccessProvider'
import './staff-layout.css'

export function StaffBookingLayout({ children }: { children: ReactNode }) {
  return (
    <RequireStaff>
      <BookingWorkspace>{children}</BookingWorkspace>
    </RequireStaff>
  )
}
function BookingWorkspace({ children }: { children: ReactNode }) {
  const { logout } = useAppAuth()
  const { role } = useMyAccess()
  /* The API exposes the caller's role but no staff display name, so Clerk's name is the best stand-in for the
     "Alex Carter" of the design. */
  const { user: clerkUser } = useUser()
  const roleName = role?.name ?? 'Staff member'
  const displayName = clerkUser?.fullName?.trim()
  return (
    <SidebarProvider className="f3-staff-workspace bg-page font-sans text-foreground [color-scheme:light]">
      <AppSidebar roleName={roleName} onSignOut={() => void logout()} expandedGroup="Customer Management" />
      <SidebarInset className="min-w-0 bg-page">
        <header className="f3-staff-workspace-header">
          <SidebarTrigger aria-label="Toggle staff navigation" />
          <span className="f3-staff-workspace-identity">
            {displayName ? `${displayName} · ` : ''}
            {roleName}
          </span>
        </header>
        <div className="f3-staff-workspace-body">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
