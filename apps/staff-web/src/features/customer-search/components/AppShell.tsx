import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { CloseIcon, MenuIcon } from './Icons'
import '@staff-web/features/security-screening/fonts.css'
import '@staff-web/features/security-screening/screening.css'

/**
 * Admin chrome for the Customer Search screens: the dark workspace sidebar on
 * desktop and the compact header + full-screen drawer on mobile.
 *
 * The signed-in staff identity and Sign out come from the platform-owned
 * `AuthProvider`; this shell does not create or manage a session of its own.
 */

interface AppShellProps {
  children: ReactNode
}

interface NavItemProps {
  label: string
  caption?: string
  active?: boolean
  disabled?: boolean
  disabledReason?: string
  to?: '/customer-search' | '/security-screening/screening-queue'
  onNavigate?: () => void
}

function NavItem({ label, caption, active = false, disabled = false, disabledReason, to, onNavigate }: NavItemProps) {
  const className = ['cs-nav-item', active && 'is-active', disabled && 'is-disabled'].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="cs-nav-item__label">{label}</span>
      {caption ? <span className="cs-nav-item__caption">{caption}</span> : null}
    </>
  )

  return disabled ? (
    <span className={className} aria-disabled="true" title={disabledReason}>
      {content}
    </span>
  ) : to ? (
    <Link
      to={to}
      search={to === '/security-screening/screening-queue' ? { status: 'needs-review' } : undefined}
      viewTransition
      preload="intent"
      className={className}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      style={{ textDecoration: 'none' }}
    >
      {content}
    </Link>
  ) : (
    <span className={className} aria-current={active ? 'page' : undefined}>
      {content}
    </span>
  )
}

const DRAWER_ITEMS: ReadonlyArray<NavItemProps> = [
  { label: 'Customer Search', caption: 'Find any customer or passenger · read-only', active: true, to: '/customer-search' },
  {
    label: 'Security Screening',
    caption: 'Screening queue · Watchlist · security role only',
    to: '/security-screening/screening-queue',
  },
]

function Brand() {
  return (
    <span className="cs-brand__word">
      Airlines
      <span className="cs-brand__underline" aria-hidden="true" />
    </span>
  )
}

export function AppShell({ children }: AppShellProps) {
  const { logout } = useAppAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // The design shows the staff role, not an account name. `AppUser` only carries
  // an email and a type, so naming a person here would mean inventing one.
  const displayName = 'Administrator'

  return (
    <div className={`cs-app${collapsed ? ' is-sidebar-collapsed' : ''}`}>
      <aside className="sq-sidebar cs-screening-sidebar" aria-label="Primary">
        <button
          type="button"
          className="cs-screening-collapse"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          aria-controls="cs-desktop-navigation"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '›' : '‹'}
        </button>
        <div className="sq-brand" aria-label="Airlines">
          {collapsed ? 'A' : 'Airlines'}
        </div>
        <div className="sq-brand-line" />
        <p className="sq-workspace">ADMIN WORKSPACE</p>
        <nav id="cs-desktop-navigation" aria-label="Staff navigation">
          <Link
            to="/customer-search"
            className="sq-nav-active"
            aria-current="page"
            aria-label="Customer Search"
            title="Customer Search"
            viewTransition
          >
            Customer Search
          </Link>
          <Link
            to="/security-screening/screening-queue"
            search={{ status: 'needs-review' }}
            aria-label="Security Screening"
            title="Security Screening"
            viewTransition
            preload="intent"
          >
            Security Screening
          </Link>
        </nav>
        <div className="sq-account">
          <strong>{displayName}</strong>
          <p>Navigation follows assigned staff permissions.</p>
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="cs-shell">
        <header className="cs-mobile-header">
          {/* The badge is a sibling of the brand, not one of its children: the design
              puts it to the right of the wordmark, next to the menu button, and a
              nested span would have to fight the flex gap to get there. */}
          <div className="cs-mobile-header__brand">
            <Brand />
          </div>
          <span className="cs-mobile-header__badge">Staff</span>
          <button
            type="button"
            className="cs-mobile-header__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <MenuIcon />
          </button>
        </header>

        <main className="cs-main">{children}</main>
      </div>

      {drawerOpen ? (
        <div className="cs-drawer" role="dialog" aria-modal="true" aria-label="Workspace navigation">
          <div className="cs-drawer__top">
            <h2 className="cs-drawer__brand">
              Airlines
              <span className="cs-drawer__underline" aria-hidden="true" />
            </h2>
            <button type="button" className="cs-drawer__close" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
              <CloseIcon />
            </button>
          </div>

          <nav className="cs-drawer__nav" aria-label="Workspace">
            {DRAWER_ITEMS.map((item) => (
              <NavItem key={item.label} {...item} onNavigate={() => setDrawerOpen(false)} />
            ))}
          </nav>

          <div className="cs-drawer__footer">
            <p className="cs-drawer__user">{displayName}</p>
            <button type="button" className="cs-drawer__signout" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
