import { useEffect, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../../auth/AuthProvider'
import { formatNow } from '../format'
import type { LoadState } from '../use-load'
import { FlythonLogo } from './FlythonLogo'
import { cx, ui } from './ui'

const NAV = [
  { to: '/loyalty/members', label: 'Member Lookup', hint: 'Find members · ledger · adjust miles' },
  { to: '/loyalty/rules', label: 'Loyalty Rules', hint: 'Tiers · earning · benefits · settings' },
  { to: '/loyalty/award-release', label: 'Award Release', hint: 'Release award seats on flights' },
  { to: '/loyalty/lounge', label: 'Lounge Desk', hint: 'Check eligibility · admit guests' },
] as const

const focusAmber = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5a524]'

const navLink = cx(
  'block whitespace-nowrap rounded-lg px-3.5 py-2.5 text-[15px] text-white no-underline hover:bg-white/5',
  'data-[status=active]:bg-f11-sidebar-active data-[status=active]:font-semibold',
  focusAmber,
)

const sideCard = 'rounded-lg border border-white/15 bg-white/5 px-3.5 py-3'
const sideCardLabel = 'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70'

// The F11 staff shell. From lg up: the navy loyalty sidebar (collapsible) with the simulation clock and the signed-in
// staff member. Below lg: a white floating header with a menu button that opens the full-screen navy menu.
export function StaffLoyaltyLayout({
  title,
  purpose,
  info,
  children,
}: {
  title: string
  purpose: string
  info?: string
  children: ReactNode
}) {
  const { user } = useUser()
  const { logout, isLoading } = useAppAuth()
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Staff'
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const clock = formatNow(new Date())

  // Escape closes the phone menu; picking a link closes it too.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const signOut = (
    <button
      type="button"
      className={cx('cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] text-white', focusAmber)}
      onClick={() => void logout()}
      disabled={isLoading}
    >
      Sign out
    </button>
  )

  return (
    <div className={cx(ui.shell, collapsed ? 'lg:grid-cols-[72px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]')} data-full-bleed>
      {/* Desktop sidebar */}
      <aside
        className={cx(
          'sticky top-0 hidden h-svh flex-col gap-2 overflow-y-auto bg-f11-sidebar bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.06),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.04),transparent_40%)] py-6 text-white lg:flex',
          collapsed ? 'items-center px-3' : 'px-[22px]',
        )}
        aria-label="Staff navigation"
      >
        <div className={cx('flex items-start gap-2', collapsed ? 'flex-col items-center' : 'justify-between')}>
          {!collapsed && <FlythonLogo tone="light" />}
          <button
            type="button"
            className={cx(
              'grid size-7 flex-none cursor-pointer place-items-center rounded-md border border-white/25 bg-white/10 text-white hover:bg-white/20',
              focusAmber,
            )}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-expanded={!collapsed}
          >
            <svg viewBox="0 0 16 16" className={cx('size-3.5', collapsed && 'rotate-180')} aria-hidden="true">
              <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {!collapsed && (
          <>
            <span className="mt-5 px-1.5 text-xs uppercase tracking-[0.06em] text-white/75">Staff · Loyalty</span>
            <span className="mt-6 mb-1 px-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/70">Loyalty programme</span>
          </>
        )}
        <nav className={cx('flex flex-col gap-1', collapsed && 'mt-6')} aria-label="Loyalty programme">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={cx(navLink, collapsed && 'px-0 text-center')} title={collapsed ? n.label : undefined}>
              {collapsed ? n.label.slice(0, 1) : n.label}
            </Link>
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <div className={sideCard}>
              <span className={sideCardLabel}>
                <span className="size-1.5 rounded-full bg-[#f5a524]" aria-hidden="true" />
                Simulation clock
              </span>
              <strong className="mt-1 block text-base font-bold">{clock}</strong>
            </div>
            <div className={sideCard}>
              <span className={sideCardLabel}>
                <span className="size-1.5 rounded-full bg-[#4ade80]" aria-hidden="true" />
                Signed in as
              </span>
              <strong className="mt-1 block truncate text-base font-bold">{name}</strong>
            </div>
            <p className="m-0 text-[13px] leading-snug text-white/70">Loyalty Admin. Navigation follows assigned staff permissions.</p>
            {signOut}
          </div>
        )}
      </aside>

      {/* Phone and tablet header */}
      <header className="sticky top-0 z-10 bg-f11-canvas px-3 pt-3 pb-1 lg:hidden">
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-2.5 shadow-[0_6px_18px_rgba(16,37,68,0.12)]">
          <FlythonLogo tone="dark" />
          <button
            type="button"
            className="grid size-11 cursor-pointer place-items-center rounded-xl border-0 bg-f11-sidebar text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="loyalty-menu"
          >
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {menuOpen && (
        <div
          id="loyalty-menu"
          className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-f11-sidebar px-5 pt-8 pb-8 text-white lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="flex items-center justify-between">
            <FlythonLogo tone="light" />
            <button
              type="button"
              className={cx(
                'grid size-11 cursor-pointer place-items-center rounded-xl border-0 bg-f11-sidebar-active text-white',
                focusAmber,
              )}
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              autoFocus
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <nav className="mt-9 flex flex-col gap-2.5" aria-label="Loyalty programme">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className={cx(
                  'flex flex-col gap-1 rounded-xl border border-transparent bg-white/8 px-[18px] py-4 text-white no-underline',
                  'data-[status=active]:border-[#f5a524] data-[status=active]:bg-f11-sidebar-active',
                  focusAmber,
                )}
              >
                <strong className="text-base font-semibold">{n.label}</strong>
                <span className="text-[13px] text-white/70">{n.hint}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-1 pt-10">
            <strong className="text-lg font-semibold">{name}</strong>
            <span className="mb-4 text-[13px] text-white/70">Loyalty Admin · simulation {clock}</span>
            {signOut}
          </div>
        </div>
      )}

      <main className={ui.main}>
        <h1 className={ui.title}>{title}</h1>
        <p className={ui.purpose}>{purpose}</p>
        {info && <p className={ui.info}>{info}</p>}
        {children}
      </main>
    </div>
  )
}

export function Loaded<T>({ state, retry, children }: { state: LoadState<T>; retry: () => void; children: (data: T) => ReactNode }) {
  switch (state.status) {
    case 'loading':
      return (
        <p aria-live="polite" className={ui.muted}>
          Loading…
        </p>
      )
    case 'error':
      return (
        <div className={ui.error} role="alert">
          <p>{state.message}</p>
          <button type="button" className={ui.button} onClick={retry}>
            Try again
          </button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}
