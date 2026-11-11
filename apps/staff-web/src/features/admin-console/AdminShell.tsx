import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { AppShell } from './AppShell'

/** Three tabs in display order. `current` is read from the URL so a deep link lands on the right tab. */
const TABS = [
  { to: '/admin/staff', label: 'Staff & roles' },
  { to: '/admin/roles', label: 'Role access' },
  { to: '/admin/audit-log', label: 'Audit log' },
] as const

/** The line under "ADMINISTRATION". The audit log has its own; the phone frames use a shorter one for the other tabs. */
function pageDescription(pathname: string): { desktop: string; phone: string } {
  if (pathname.startsWith('/admin/audit-log')) {
    const text = 'All staff, customer and system events across every feature. Sign-ins, sign-outs and sensitive-data views included.'
    return { desktop: text, phone: text }
  }
  return {
    desktop: 'Manage staff accounts and roles, choose which screens each role can open, and review the audit log of every feature.',
    phone: 'Manage staff accounts, what each role can see, and the audit log.',
  }
}

/**
 * Sidebar + main area + tab bar, following the F15 Figma frames. The three tabs are separate routes, so the body comes
 * from `<Outlet/>`.
 *
 * The sidebar is the shadcn `Sidebar`: on desktop it collapses to an icon rail; below 768px it becomes a sheet opened
 * from the top bar's trigger.
 *
 * A page that shows the access-denied card marks it with `data-access-denied`; the header and the tabs are then hidden,
 * so the card stands on its own as in the "Access denied (FORBIDDEN)" frame.
 */
export function AdminShell() {
  const { location } = useRouterState()
  const navigate = useNavigate()
  const description = pageDescription(location.pathname)
  const activeTab = TABS.find((t) => location.pathname === t.to || location.pathname.startsWith(t.to + '/'))?.to ?? ''

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
        <div className="flex flex-col gap-4 [.admin-shell:has([data-access-denied])_&]:hidden">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">ADMINISTRATION</h1>
            <p className="text-sm text-muted-foreground">
              <span className="max-md:hidden">{description.desktop}</span>
              <span className="hidden max-md:inline">{description.phone}</span>
            </p>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(to) => void navigate({ to })}
            className="[.admin-shell:has([data-staff-sheet])_&]:max-phone:hidden"
          >
            <TabsList aria-label="Admin tabs" className="w-full">
              {TABS.map((t) => (
                <TabsTrigger key={t.to} value={t.to} asChild className="min-w-0 truncate">
                  <Link to={t.to}>{t.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
