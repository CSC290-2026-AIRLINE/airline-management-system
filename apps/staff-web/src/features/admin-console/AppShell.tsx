import { useState, type ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Menu } from 'lucide-react'
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from '@staff-web/components/ui/sidebar'
import { AppSidebar } from './components/AppSidebar'
import { readOpen, SIDEBAR_KEY, writeOpen } from './hooks/persisted-open'
import { useMyAccess } from './components/MyAccessProvider'
import flythonLogo from './assets/flython-logo.svg'
import flythonMarkLight from './assets/flython-mark-light.svg'

/**
 * The global staff frame: the sidebar plus the main area, shared by every workspace (admin, pricing, ...). Each
 * workspace's layout route renders its own content as `children`.
 *
 * The sidebar is the shadcn `Sidebar`: on desktop it collapses to an icon rail; below 768px it becomes a sheet opened
 * from the top bar's trigger. Must be rendered inside `RequireStaff`, which supplies the caller's role.
 */
export function AppShell({ children, mobileHeader = 'sidebar' }: { children: ReactNode; mobileHeader?: 'sidebar' | 'card' }) {
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
        {mobileHeader === 'card' ? (
          <CardHeader />
        ) : (
          /* Phone top bar: the sidebar is a sheet there, so this carries its trigger. */
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden">
            <SidebarTrigger aria-label="Open navigation" />
            <img src={flythonLogo} alt="Flython Airline" className="h-8 w-auto" />
          </header>
        )}
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

/**
 * Phone top bar for workspaces that ask for it (`mobileHeader="card"`, Crew & Rostering): a white card floating on the page
 * with the wordmark and, on the right, the navy button that opens the sidebar sheet. The mark is the light-background copy
 * of the logo, since the original has a near-white ribbon. Other workspaces keep the dark bar above.
 */
function CardHeader() {
  const { toggleSidebar } = useSidebar()
  return (
    <header className="sticky top-0 z-10 bg-page px-4 pt-3 pb-1 md:hidden">
      <div className="flex items-center justify-between rounded-2xl bg-white py-2 pr-2 pl-4 shadow-md ring-1 ring-black/5">
        <div className="flex items-center gap-2.5">
          <img src={flythonMarkLight} alt="" className="h-7 w-auto shrink-0" />
          <span className="flex flex-col font-heading leading-none font-bold text-sidebar">
            <span className="text-2xl">Flython</span>
            <span className="text-[9px] tracking-[0.32em]">AIRLINES</span>
          </span>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          onClick={toggleSidebar}
          className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-sidebar text-white transition-colors hover:bg-sidebar/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar"
        >
          <Menu className="size-6" strokeWidth={2.25} />
        </button>
      </div>
    </header>
  )
}
