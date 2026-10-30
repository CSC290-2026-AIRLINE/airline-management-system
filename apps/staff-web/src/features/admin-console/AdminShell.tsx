import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { cn } from '@staff-web/lib/utils'
import { MyAccessWidget } from './components/MyAccessWidget'

/** Three tabs in display order. `current` is read from the URL so a deep link lands on the right tab. */
const TABS = [
  { to: '/admin/staff', label: 'Staff & roles' },
  { to: '/admin/roles', label: 'Role access' },
  { to: '/admin/audit-log', label: 'Audit log' },
] as const

/** The gold rule under the wordmark. `ink` is one run of letters; only the first run carries the rule. */
const RULE =
  "relative inline-block after:absolute after:left-0 after:right-[0.236em] after:-bottom-[0.175em] after:h-[0.11em] after:rounded-full after:bg-gold after:content-['']"

/**
 * Sidebar + main area + tab bar. The three tabs are separate routes, so the body comes from `<Outlet/>`.
 *
 * Desktop: a 260px navy sidebar (200px at ≤1024px) that collapses to a 64px rail with the "A" monogram.
 * ≤768px: the sidebar becomes a 64px top bar; "Admin ☰" opens the workspace links in a panel under it.
 */
export function AdminShell() {
  const { logout } = useAppAuth()
  const { location } = useRouterState()
  const [collapsed, setCollapsed] = useState(false)
  /* Only meaningful at ≤768px, where the sidebar is a top bar and the nav/footer drop into a panel. Kept separate from
     `collapsed` because the two mean opposite things: collapsing narrows a sidebar that is already on screen, whereas
     opening reveals chrome that is hidden by default on mobile. */
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="admin-shell flex min-h-screen font-sans leading-[normal] [color-scheme:light] max-tablet:flex-col">
      <aside
        className={cn(
          'sticky top-0 z-20 flex h-screen shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-navy pt-7 pb-6 text-white transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          collapsed ? 'w-16' : 'w-[260px] max-laptop:w-[200px]',
          'max-tablet:h-16 max-tablet:w-full max-tablet:flex-row max-tablet:items-center max-tablet:justify-between max-tablet:overflow-visible max-tablet:px-4 max-tablet:py-0',
        )}
      >
        <div className={cn('px-6 pb-[18px] max-tablet:p-0', collapsed && 'px-0 text-center')}>
          <span
            className={cn(
              'inline-block pb-[18px] font-heading text-[40px] leading-normal font-bold tracking-[0.02em] whitespace-nowrap max-laptop:text-[28px]',
              collapsed && 'pb-3.5 text-[28px]',
              'max-tablet:pb-1.5 max-tablet:text-[22px]',
            )}
          >
            {/* Both forms are always rendered and the classes pick one. The "A" monogram belongs to the collapsed
                desktop sidebar only: at ≤768px the sidebar is a top bar with no collapse button, so a collapse made on
                a wide screen must not leave the bar stuck on "A". */}
            <span className={cn(collapsed ? 'inline max-tablet:hidden' : 'hidden')}>
              <span className={cn(RULE, 'after:left-[0.08em] after:right-[0.08em]')}>A</span>
            </span>
            <span className={cn(collapsed ? 'hidden max-tablet:inline' : 'inline')}>
              <span className={RULE}>Air</span>
              <span className="inline-block">lines</span>
            </span>
          </span>
        </div>

        {/* Mobile-only bar toggle. The desktop sidebar has its own collapse button lower down. */}
        <button
          type="button"
          className="hidden items-center gap-2 py-2.5 text-[13px] font-semibold tracking-[0.08em] text-white uppercase max-tablet:inline-flex"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        >
          Admin
          <Menu className="size-4" aria-hidden="true" />
        </button>

        {/* `display: contents` on desktop so these stay direct flex items of the column; at ≤768px it becomes the panel
            that drops below the bar. */}
        <div
          className={cn(
            'contents',
            'max-tablet:absolute max-tablet:inset-x-0 max-tablet:top-full max-tablet:flex-col max-tablet:border-t max-tablet:border-white/10 max-tablet:bg-navy max-tablet:pt-1 max-tablet:pb-4 max-tablet:shadow-[0_12px_24px_rgba(10,20,36,0.25)]',
            navOpen ? 'max-tablet:flex' : 'max-tablet:hidden',
            collapsed && 'tablet:[&>*]:hidden',
          )}
        >
          <p className="mx-6 mb-4 text-[11px] max-tablet:mx-4 max-tablet:mt-3 max-tablet:mb-2 tracking-[0.18em] text-white/45 uppercase">
            Admin workspace
          </p>
          <nav className="flex flex-col px-3" aria-label="Workspace">
            <Link
              to="/admin/roles"
              className="relative flex items-center rounded-lg bg-navy-active py-3 pr-6 pl-9 text-sm font-medium text-white"
              activeOptions={{ exact: false }}
            >
              <span className="absolute inset-y-2 left-4 w-1 rounded-xs bg-gold" />
              Administration
            </Link>
          </nav>
          <footer className="mt-auto border-t border-white/10 px-6 pt-4 max-tablet:mt-2 max-tablet:px-4 max-tablet:pt-3">
            <p className="mb-1 text-[13px] font-semibold text-white">Administrator</p>
            <p className="mb-3 text-xs leading-[26px] text-white/50">Menu shows the screens your role can open.</p>
            <button
              type="button"
              className="w-full rounded-sm border border-white/25 py-2 text-[13px] font-medium text-white hover:bg-white/5"
              onClick={() => void logout()}
            >
              Sign out
            </button>
            <MyAccessWidget />
          </footer>
        </div>

        <button
          type="button"
          className={cn(
            'absolute z-[2] flex items-center justify-center rounded-md border border-[#6e87b2cc] bg-white/5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] transition-all duration-300 hover:border-[#6e87b2] hover:bg-white/10 max-tablet:hidden',
            collapsed ? 'top-[92px] right-3.5 size-9' : 'top-7 right-4 size-7',
          )}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="size-4" strokeWidth={2.5} /> : <ChevronLeft className="size-4" strokeWidth={2.5} />}
        </button>
      </aside>

      <main className="flex min-w-0 flex-auto flex-col bg-page">
        <header className="border-b border-line bg-white px-14 pt-8 pb-5 max-laptop:px-8 max-tablet:px-5 max-tablet:pt-5 max-tablet:pb-3.5 max-phone:px-4 max-phone:pt-[18px] max-phone:pb-3">
          <h1 className="mt-0 mb-1.5 font-heading text-[28px] leading-[26px] font-bold tracking-[0.02em] text-ink uppercase max-tablet:text-[22px] max-phone:text-[19px]">
            Administration
          </h1>
          <p className="text-sm leading-normal text-[#6b7280] max-tablet:text-[13px] max-phone:text-xs">
            Manage staff accounts and roles, choose which screens each role can open, and review the audit log of every feature.
          </p>
        </header>

        <nav
          className="flex bg-secondary px-14 [.admin-shell:has([data-staff-sheet])_&]:max-phone:hidden py-1.5 max-laptop:px-8 max-tablet:gap-1 max-tablet:px-4 max-tablet:py-2 max-phone:py-2.5"
          aria-label="Admin tabs"
        >
          {TABS.map((t) => {
            const active = location.pathname === t.to || location.pathname.startsWith(t.to + '/')
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-md px-4 py-2 text-center text-[13px] leading-[26px] font-medium transition-colors max-tablet:px-1 max-tablet:text-xs',
                  active ? 'bg-primary text-white' : 'text-[#6b7280] hover:bg-ink/5 hover:text-[#111827]',
                )}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex flex-auto flex-col px-14 pt-6 pb-[60px] max-laptop:px-8 max-tablet:px-5 max-tablet:pt-5 max-phone:px-4 max-phone:pt-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
