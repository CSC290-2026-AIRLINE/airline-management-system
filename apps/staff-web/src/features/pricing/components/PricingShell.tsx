import { useState, type ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import '../pricing.css'

// Merriweather for the Flython logo, Inter for everything else.
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@700;900&display=swap'

// Pages not built yet stay in the menu (so the layout matches the design) but are not links.
const NAV = [
  {
    group: 'Pricing',
    items: [
      { label: 'Fare Setup', to: '/pricing/fare-setup' },
      { label: 'Pricing Rules', to: '/pricing/pricing-rules' },
      { label: 'Taxes, Currency & Promos' },
    ],
  },
  {
    group: 'Finance',
    items: [{ label: 'Expenses & Payments' }, { label: 'Monthly Report' }],
  },
] as const

interface PricingShellProps {
  title: string
  description: string
  // Buttons for the right of the page header (e.g. "Open price simulator"); replaces the simulated-date chip.
  actions?: ReactNode
  children: ReactNode
}

export function PricingShell({ title, description, actions, children }: PricingShellProps) {
  // Phone only: the sidebar becomes a menu that drops down from the top bar.
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const { user, logout } = useAppAuth()
  const { user: clerkUser } = useUser()
  const navigate = useNavigate()
  // Staff roles are not enforced yet (everyone is created as admin), so the account block shows who is signed in, not a role.
  const displayName = clerkUser?.fullName || user?.email || 'Staff'

  // logout() ends our session and Clerk's; the route guard only re-checks on navigation, so go to /login explicitly.
  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      void navigate({ to: '/login' })
    }
  }

  return (
    <div className={`pr-shell${menuOpen ? ' is-menu-open' : ''}`}>
      {/* React 19 hoists this into <head> once, so the fonts load only on pricing pages and index.html stays shared. */}
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
      <aside className="pr-sidebar">
        <div className="pr-brand">
          <strong>Flython</strong>
          <span className="text-sm">Staff · Pricing &amp; Finance</span>
        </div>
        <button
          type="button"
          className="pr-menu-button"
          aria-expanded={menuOpen}
          aria-controls="pr-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          Menu <span aria-hidden="true">{menuOpen ? '×' : '≡'}</span>
        </button>
        {/* Desktop: fills the sidebar with the account block pinned to the bottom. Phone: the drop-down menu. */}
        <div id="pr-nav" className="pr-sidebar-menu">
          <nav aria-label="Pricing and finance" onClick={() => setMenuOpen(false)}>
            {NAV.map(({ group, items }) => (
              <div key={group} className="pr-nav-group">
                <p className="pr-nav-heading">{group}</p>
                <ul>
                  {items.map((item) => (
                    <li key={item.label}>
                      {'to' in item ? (
                        <Link
                          to={item.to}
                          className="pr-nav-item"
                          activeProps={{ className: 'pr-nav-item is-active', 'aria-current': 'page' }}
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <span className="pr-nav-item is-disabled" aria-disabled="true" title="Not built yet">
                          {item.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="pr-account">
            <strong>{displayName}</strong>
            {user?.email && displayName !== user.email && <span>{user.email}</span>}
            <button type="button" className="pr-sign-out" disabled={signingOut} onClick={() => void handleSignOut()}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </aside>

      <main className="pr-main">
        <header className="pr-header">
          <div>
            <h1 className="pr-title">{title}</h1>
            <p className="pr-subtitle">{description}</p>
          </div>
          {actions ?? (
            // The simulation clock (Platform) has no API yet, so no date is shown rather than a made-up one.
            <span className="pr-sim-chip" title="Waiting for the simulation clock API">
              Simulated today · not connected
            </span>
          )}
        </header>
        {children}
      </main>
    </div>
  )
}
