import type { ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@staff-web/components/ui/sidebar'
import { AppSidebar } from './components/AppSidebar'
import { useMyAccess } from './components/MyAccessProvider'
import flythonMark from './assets/flython-mark.svg'

/**
 * The global staff frame: the sidebar plus the main area, shared by every workspace (admin, pricing, ...). Each
 * workspace's layout route renders its own content as `children`.
 *
 * The sidebar is the shadcn `Sidebar`: on desktop it collapses to an icon rail; below 768px it becomes a sheet opened
 * from the top bar's trigger. Must be rendered inside `RequireStaff`, which supplies the caller's role.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { logout } = useAppAuth()
  /* The caller's own role, from the one `GET /api/me/screens` that `RequireStaff` already made. */
  const { role } = useMyAccess()
  const roleName = role?.name ?? 'Staff member'

  return (
    <SidebarProvider className="admin-shell bg-page font-sans text-foreground [color-scheme:light]">
      <AppSidebar roleName={roleName} onSignOut={() => void logout()} />
      <SidebarInset className="min-w-0 bg-page">
        {/* Phone top bar: the sidebar is a sheet there, so this carries its trigger. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <img src={flythonMark} alt="" className="h-5 w-auto" />
          <span className="font-heading font-bold">Flython</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
