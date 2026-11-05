import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Button } from '@staff-web/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { cn } from '@staff-web/lib/utils'
import { useMyAccess } from './components/MyAccessProvider'
import { SidebarNav } from './components/SidebarNav'
import flythonMark from './assets/flython-mark.svg'
import sidebarTexture from './assets/sidebar-texture.png'

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
 * The Flython mark and wordmark from the Figma sidebar. `compact` is the collapsed rail's "A" with the short gold rule.
 * The phone top bar uses the same lockup, smaller.
 */
function Wordmark({ compact = false, size }: { compact?: boolean; size: 'sidebar' | 'bar' }) {
  if (compact) {
    return (
      <span className="inline-flex flex-col items-start">
        <span className="font-heading text-4xl font-bold text-white">A</span>
        <span className="mt-0.5 h-1 w-6 rounded-xs bg-gold" />
      </span>
    )
  }
  const bar = size === 'bar'
  return (
    <span className={cn('inline-flex items-center', bar ? 'gap-2' : 'gap-3.5')}>
      <img src={flythonMark} alt="" className={cn('w-auto', bar ? 'h-5' : 'h-7.5')} />
      <span className="flex flex-col font-heading font-bold text-white">
        <span className={cn('leading-tight', bar ? 'text-lg' : 'text-[27px]')}>Flython</span>
        <span className={cn('leading-none', bar ? 'text-[5px] tracking-[1.6px]' : 'text-[7.5px] tracking-[2.46px]')}>AIRLINES</span>
      </span>
    </span>
  )
}

/** Workspace link + the signed-in footer. Shared by the desktop sidebar and the phone menu. */
function SidebarBody({ onSignOut, roleName }: { onSignOut: () => void; roleName: string }) {
  return (
    <>
      <SidebarNav />
      <footer className="mt-auto pb-8 max-tablet:mt-8 max-tablet:pb-0">
        <div className="rounded-[10px] border border-white/14 bg-white/6 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.63px] text-white/65 uppercase">
            <span className="size-1.75 rounded-full bg-[#4ade80]" aria-hidden="true" />
            Signed in as
          </p>
          <p className="mt-1 text-[15px] font-semibold text-white">{roleName}</p>
        </div>
        <p className="mt-2 px-3 text-xs leading-tight text-white/70">Menu shows the screens your role can open.</p>
        <Button
          type="button"
          variant="link"
          className="mt-4 h-auto px-3 py-0 text-sm font-medium text-white hover:underline"
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </footer>
    </>
  )
}

/**
 * Sidebar + main area + tab bar, following the F15 Figma frames. The three tabs are separate routes, so the body comes
 * from `<Outlet/>`.
 *
 * Desktop: a 260px navy sidebar that collapses to a narrow rail with the "A" monogram (the page content stays where it
 * is). ≤768px: a 72px top bar; "ADMIN ☰" opens the workspace link and the footer in a panel under it.
 *
 * A page that shows the access-denied card marks it with `data-access-denied`; the header and the tabs are then hidden,
 * so the card stands on its own as in the "Access denied (FORBIDDEN)" frame.
 */
export function AdminShell() {
  const { logout } = useAppAuth()
  const { location } = useRouterState()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  /* Only meaningful at ≤768px, where the sidebar is a top bar and the nav/footer drop into a panel. Kept separate from
     `collapsed` because the two mean opposite things: collapsing narrows a sidebar that is already on screen, whereas
     opening reveals chrome that is hidden by default on mobile. */
  const [navOpen, setNavOpen] = useState(false)
  const description = pageDescription(location.pathname)
  const activeTab = TABS.find((t) => location.pathname === t.to || location.pathname.startsWith(t.to + '/'))?.to ?? ''
  /* The caller's own role, from the one `GET /api/me/screens` that `RequireStaff` already made. The sidebar used to
     say "Administrator" to everybody; it now names the role they actually hold. */
  const { role } = useMyAccess()
  const roleName = role?.name ?? 'Staff member'

  return (
    <div className="admin-shell flex min-h-screen bg-page font-sans text-foreground [color-scheme:light] max-tablet:flex-col">
      {/* Desktop sidebar ------------------------------------------------ */}
      <aside
        className={cn(
          'sticky top-0 z-20 isolate flex h-screen shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-navy text-white transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-tablet:hidden',
          collapsed ? 'w-18 items-center pt-6' : 'w-65 px-5.5 pt-7',
        )}
      >
        {/* The Figma sidebar's pattern, laid over the navy at 60% (luminosity blend). Only on the expanded sidebar: the
            collapsed rail is flat navy in the frames. */}
        {!collapsed && (
          <img
            src={sidebarTexture}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 size-full object-cover opacity-60 mix-blend-luminosity"
          />
        )}
        <div className={cn(!collapsed && 'pl-1.5')}>
          <Wordmark size="sidebar" compact={collapsed} />
        </div>
        {collapsed ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mt-6 border-white/30 bg-navy-active text-white hover:border-white/50 hover:bg-navy-active hover:text-white"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </Button>
            <SidebarNav compact />
          </>
        ) : (
          <>
            <p className="mt-5 pl-1.5 text-xs text-[#b7c1d1]">ADMIN WORKSPACE</p>
            <SidebarBody onSignOut={() => void logout()} roleName={roleName} />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="absolute top-5.5 right-3.5 size-7 border-white/30 bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
            </Button>
          </>
        )}
      </aside>

      {/* Phone top bar --------------------------------------------------- */}
      <header className="sticky top-0 z-20 hidden h-18 shrink-0 items-center justify-between bg-navy px-5 text-white max-tablet:flex">
        <Wordmark size="bar" />
        <Button
          type="button"
          variant="ghost"
          className="h-auto gap-1.5 p-0 text-sm text-white hover:bg-transparent hover:text-white"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close admin navigation' : 'Open admin navigation'}
        >
          ADMIN
          {navOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
        </Button>
        {navOpen && (
          <div className="absolute inset-x-0 top-full flex flex-col border-t border-white/10 bg-navy px-5 pt-1 pb-6">
            <p className="text-xs text-[#b7c1d1]">ADMIN WORKSPACE</p>
            <SidebarBody onSignOut={() => void logout()} roleName={roleName} />
          </div>
        )}
      </header>

      <main className="flex min-w-0 flex-auto flex-col pr-24 pb-14 pl-14 max-wide:pr-14 max-laptop:px-8 max-tablet:px-5 max-tablet:pb-10">
        <div className="contents [.admin-shell:has([data-access-denied])_&]:hidden">
          <h1 className="mt-9 mb-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-foreground max-tablet:mt-5 max-tablet:text-2xl">
            ADMINISTRATION
          </h1>
          <p className="mt-5 text-base text-muted-foreground max-tablet:mt-3 max-tablet:text-sm">
            <span className="max-tablet:hidden">{description.desktop}</span>
            <span className="hidden max-tablet:inline">{description.phone}</span>
          </p>

          <Tabs
            value={activeTab}
            onValueChange={(to) => void navigate({ to })}
            className="mt-5 max-tablet:mt-3 [.admin-shell:has([data-staff-sheet])_&]:max-phone:hidden"
          >
            <TabsList
              aria-label="Admin tabs"
              className="w-full rounded-[10px] bg-secondary p-0 group-data-[orientation=horizontal]/tabs:h-10"
            >
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.to}
                  value={t.to}
                  asChild
                  className="h-full min-w-0 truncate rounded-lg border-0 px-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:hover:bg-primary data-[state=active]:hover:text-white max-tablet:text-xs"
                >
                  <Link to={t.to}>{t.label}</Link>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-5 flex flex-auto flex-col max-tablet:mt-3 [.admin-shell:has([data-access-denied])_&]:mt-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
