import { useState, type ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@staff-web/components/ui/sidebar'
import { AppSidebar } from './components/AppSidebar'
import { readOpen, SIDEBAR_KEY, writeOpen } from './hooks/persisted-open'
import { useMyAccess } from './components/MyAccessProvider'
import flythonLogo from './assets/flython-logo.svg'

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
  /* Controlled, because the shadcn provider hands every change to `onOpenChange` once it is given and stops tracking it. */
  const [open, setOpen] = useState(() => readOpen(SIDEBAR_KEY, true))

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        writeOpen(SIDEBAR_KEY, next)
      }}
      className="admin-shell bg-page font-sans text-foreground [color-scheme:light]"
    >
      <AppSidebar roleName={roleName} onSignOut={() => void logout()} />
      <SidebarInset className="min-w-0 bg-page">
        {/* Phone top bar: the sidebar is a sheet there, so this carries its trigger. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <SidebarTrigger aria-label="Open navigation" />
          <img src={flythonLogo} alt="Flython Airline" className="h-8 w-auto" />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
