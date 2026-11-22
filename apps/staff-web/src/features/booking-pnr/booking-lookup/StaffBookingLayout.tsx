import type { ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@staff-web/components/ui/sidebar'
import { AppSidebar } from '@staff-web/features/admin-console/components/AppSidebar'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { useMyAccess } from '@staff-web/features/admin-console/components/MyAccessProvider'

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
  const roleName = role?.name ?? 'Staff member'
  return (
    // admin-shell: the shared #root override (src/index.css) that lets sidebar pages fill the viewport.
    <SidebarProvider className="admin-shell bg-page font-sans text-foreground [color-scheme:light]">
      <AppSidebar roleName={roleName} onSignOut={() => void logout()} expandedGroup="Customer Management" />
      <SidebarInset className="min-w-0 bg-page">
        <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
        </div>
        <div className="min-w-0 flex-1 text-left text-sm text-foreground [&_:is(h1,h2,h3)]:m-0 [&_:is(h1,h2,h3)]:font-sans [&_:is(h1,h2,h3)]:tracking-normal [&_:is(h1,h2,h3)]:text-foreground">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
