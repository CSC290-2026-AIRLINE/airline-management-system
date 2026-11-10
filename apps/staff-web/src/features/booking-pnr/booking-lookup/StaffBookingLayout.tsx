import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
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
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <SidebarProvider className="f3-staff-workspace bg-page font-sans text-foreground [color-scheme:light]">
      <AppSidebar roleName={role?.name ?? 'Staff member'} onSignOut={() => void logout()} />
      <SidebarInset className="min-w-0 bg-page">
        <header className="f3-staff-workspace-header">
          <SidebarTrigger aria-label="Toggle staff navigation" />
          <span>Customer management</span>
          <span className="f3-staff-workspace-role">{role?.name ?? 'Staff member'}</span>
        </header>
        <nav className="f3-staff-booking-nav" aria-label="Booking workspace">
          <a href="/booking-lookup" aria-current={pathname === '/booking-lookup' ? 'page' : undefined}>
            Bookings
          </a>
          <a href="/book-for-customer" aria-current={pathname === '/book-for-customer' ? 'page' : undefined}>
            Book for Customer
          </a>
          <a href="/assistance">Assistance Queue</a>
        </nav>
        <div className="f3-staff-workspace-body">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
