import { Outlet, useRouterState } from '@tanstack/react-router'
import { AppShell } from './AppShell'

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
 * Sidebar + main area, following the F15 Figma frames. The three admin screens (Staff & roles, Role access, Audit log) are
 * separate routes reached from the sidebar's Administration group, so the body comes from `<Outlet/>`.
 *
 * The sidebar is the shadcn `Sidebar`: on desktop it collapses to an icon rail; below 768px it becomes a sheet opened
 * from the top bar's trigger.
 *
 * A page that shows the access-denied card marks it with `data-access-denied`; the header is then hidden,
 * so the card stands on its own as in the "Access denied (FORBIDDEN)" frame.
 */
export function AdminShell() {
  const { location } = useRouterState()
  const description = pageDescription(location.pathname)

  return (
    <AppShell>
      <div className="flex w-full max-w-6xl flex-1 flex-col gap-4 px-6 pt-6 pb-10 min-[1100px]:px-[63px]">
        <div className="flex flex-col gap-4 [.admin-shell:has([data-access-denied])_&]:hidden">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">ADMINISTRATION</h1>
            <p className="text-sm text-muted-foreground">
              <span className="max-md:hidden">{description.desktop}</span>
              <span className="hidden max-md:inline">{description.phone}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </AppShell>
  )
}
