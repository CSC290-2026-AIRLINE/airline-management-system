import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { cn } from '@staff-web/lib/utils'

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

/** "Airlines" with the short gold rule under it, as in the Figma sidebar. `compact` is the collapsed rail's "A". */
function Wordmark({ compact = false, size }: { compact?: boolean; size: 'sidebar' | 'bar' }) {
  return (
    <span className="inline-flex flex-col items-start">
      <span className={cn('font-heading leading-[normal] font-bold text-white', size === 'sidebar' ? 'text-[40px]' : 'text-[24px]')}>
        {compact ? 'A' : 'Airlines'}
      </span>
      <span className={cn('rounded-[2px] bg-gold', size === 'sidebar' ? 'mt-0.5 h-1 w-[52px]' : 'h-[3px] w-[34px]', compact && 'w-6')} />
    </span>
  )
}

/** Workspace link + the signed-in footer. Shared by the desktop sidebar and the phone menu. */
function SidebarBody({ onSignOut }: { onSignOut: () => void }) {
  return (
    <>
      <nav className="mt-[17px] flex w-[216px] flex-col max-tablet:w-auto" aria-label="Workspace">
        <Link
          to="/admin/roles"
          className="rounded-md border-l-[3px] border-gold bg-navy-active px-3 py-[9px] text-sm font-semibold text-white"
          activeOptions={{ exact: false }}
        >
          Administration
        </Link>
      </nav>
      <footer className="mt-auto px-3.5 pb-[47px] max-tablet:mt-8 max-tablet:px-3 max-tablet:pb-0">
        <p className="text-[22px] font-semibold text-white">Administrator</p>
        <p className="mt-[19px] w-[204px] text-xs leading-[1.2] text-[#b7c1d1]">Menu shows the screens your role can open.</p>
        <button type="button" className="mt-[19px] text-sm font-medium text-white hover:underline" onClick={onSignOut}>
          Sign out
        </button>
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
  const [collapsed, setCollapsed] = useState(false)
  /* Only meaningful at ≤768px, where the sidebar is a top bar and the nav/footer drop into a panel. Kept separate from
     `collapsed` because the two mean opposite things: collapsing narrows a sidebar that is already on screen, whereas
     opening reveals chrome that is hidden by default on mobile. */
  const [navOpen, setNavOpen] = useState(false)
  const description = pageDescription(location.pathname)

  return (
    <div className="admin-shell flex min-h-screen bg-page font-sans leading-[normal] text-ink [color-scheme:light] max-tablet:flex-col">
      {/* Desktop sidebar ------------------------------------------------ */}
      <aside
        className={cn(
          'sticky top-0 z-20 flex h-screen shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-navy text-white transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-tablet:hidden',
          collapsed ? 'w-[72px] items-center pt-6' : 'w-[260px] px-[22px] pt-[29px]',
        )}
      >
        <div className={cn(!collapsed && 'pl-1.5')}>
          <Wordmark size="sidebar" compact={collapsed} />
        </div>
        {collapsed ? (
          <button
            type="button"
            className="mt-6 flex size-9 items-center justify-center rounded-md border border-[#6e87b2cc] bg-navy-active text-white hover:border-[#6e87b2]"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight className="size-4" strokeWidth={2.5} />
          </button>
        ) : (
          <>
            <p className="mt-2.5 pl-1.5 text-xs text-[#b7c1d1]">ADMIN WORKSPACE</p>
            <SidebarBody onSignOut={() => void logout()} />
            <button
              type="button"
              className="absolute top-[22px] right-[14px] flex size-7 items-center justify-center rounded-md border border-[#6e87b2cc] bg-white/10 text-white hover:bg-white/15"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
            </button>
          </>
        )}
      </aside>

      {/* Phone top bar --------------------------------------------------- */}
      <header className="sticky top-0 z-20 hidden h-[72px] shrink-0 items-center justify-between bg-navy px-5 text-white max-tablet:flex">
        <Wordmark size="bar" />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-[0.02em]"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close admin navigation' : 'Open admin navigation'}
        >
          ADMIN
          {navOpen ? <X className="size-4" aria-hidden="true" /> : <Menu className="size-4" aria-hidden="true" />}
        </button>
        {navOpen && (
          <div className="absolute inset-x-0 top-full flex flex-col bg-navy px-5 pt-1 pb-6 shadow-[0_12px_24px_rgba(10,20,36,0.25)]">
            <p className="text-xs text-[#b7c1d1]">ADMIN WORKSPACE</p>
            <SidebarBody onSignOut={() => void logout()} />
          </div>
        )}
      </header>

      <main className="flex min-w-0 flex-auto flex-col pr-[120px] pb-[60px] pl-[55px] max-wide:pr-[55px] max-laptop:px-8 max-tablet:px-5 max-tablet:pb-10">
        <div className="contents [.admin-shell:has([data-access-denied])_&]:hidden">
          <h1 className="mt-9 mb-0 font-sans text-[28px] leading-[normal] font-bold tracking-normal text-ink max-tablet:mt-[22px] max-tablet:text-[26px]">
            ADMINISTRATION
          </h1>
          <p className="mt-[22px] text-base text-muted-foreground max-tablet:mt-3 max-tablet:text-sm">
            <span className="max-tablet:hidden">{description.desktop}</span>
            <span className="hidden max-tablet:inline">{description.phone}</span>
          </p>

          <nav
            className="mt-5 flex h-10 shrink-0 overflow-hidden rounded-[10px] bg-secondary max-tablet:mt-3 [.admin-shell:has([data-staff-sheet])_&]:max-phone:hidden"
            aria-label="Admin tabs"
          >
            {TABS.map((t) => {
              const active = location.pathname === t.to || location.pathname.startsWith(t.to + '/')
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={cn(
                    'flex min-w-0 flex-1 items-center justify-center truncate rounded-lg px-2 text-sm font-semibold transition-colors max-tablet:text-xs',
                    active ? 'bg-primary text-white' : 'text-[#455473] hover:bg-[#dde3ee] hover:text-ink',
                  )}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="mt-5 flex flex-auto flex-col max-tablet:mt-3 [.admin-shell:has([data-access-denied])_&]:mt-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
