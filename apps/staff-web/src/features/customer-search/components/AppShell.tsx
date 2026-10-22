import { useState, type ReactNode } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, MenuIcon } from './Icons'

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
}

function NavItem({ label, caption, active = false, disabled = false, disabledReason }: NavItemProps) {
  const className = ['cs-nav-item', active && 'is-active', disabled && 'is-disabled'].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="cs-nav-item__label">{label}</span>
      {caption ? <span className="cs-nav-item__caption">{caption}</span> : null}
    </>
  )

  // `Security Screening` appears in the design but is outside this feature, so
  // it is rendered inert rather than linked to a route that does not exist.
  return disabled ? (
    <span className={className} aria-disabled="true" title={disabledReason}>
      {content}
    </span>
  ) : (
    <span className={className} aria-current={active ? 'page' : undefined}>
      {content}
    </span>
  )
}

const NAV_ITEMS: ReadonlyArray<NavItemProps> = [
  { label: 'Customer Search', active: true },
  { label: 'Security Screening', disabled: true, disabledReason: 'Not part of this feature' },
]

const DRAWER_ITEMS: ReadonlyArray<NavItemProps> = [
  { label: 'Customer Search', caption: 'Find any customer or passenger · read-only', active: true },
  {
    label: 'Security Screening',
    caption: 'Screening queue · Watchlist · security role only',
    disabled: true,
    disabledReason: 'Not part of this feature',
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
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // The design shows the staff role, not an account name. `AppUser` only carries
  // an email and a type, so naming a person here would mean inventing one.
  const displayName = 'Administrator'

  return (
    <div className={['cs-app', collapsed && 'is-sidebar-collapsed'].filter(Boolean).join(' ')}>
      <aside className="cs-sidebar" aria-label="Primary">
        <div className="cs-sidebar__top">
          <span className="cs-brand">
            <Brand />
          </span>
          <button
            type="button"
            className="cs-sidebar__collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>

        {!collapsed ? <p className="cs-sidebar__eyebrow">Admin workspace</p> : null}

        <nav className="cs-nav" aria-label="Workspace">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.label} {...item} />
          ))}
        </nav>

        {!collapsed ? (
          <div className="cs-sidebar__footer">
            <p className="cs-sidebar__user">{displayName}</p>
            <p className="cs-sidebar__note">Navigation follows assigned staff permissions.</p>
            <button type="button" className="cs-sidebar__signout" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        ) : null}
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
              <NavItem key={item.label} {...item} />
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
