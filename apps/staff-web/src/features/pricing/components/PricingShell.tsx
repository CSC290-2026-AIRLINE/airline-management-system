import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import '../pricing.css'

// Pages not built yet stay in the menu (so the layout matches the design) but are not links.
const NAV = [
  {
    group: 'Pricing',
    items: [{ label: 'Fare Setup', to: '/pricing/fare-setup' }, { label: 'Pricing Rules' }, { label: 'Taxes, Currency & Promos' }],
  },
  {
    group: 'Finance',
    items: [{ label: 'Expenses & Payments' }, { label: 'Monthly Report' }],
  },
] as const

interface PricingShellProps {
  title: string
  description: string
  children: ReactNode
}

export function PricingShell({ title, description, children }: PricingShellProps) {
  // Phone only: the sidebar becomes a menu that drops down from the top bar.
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={`pr-shell${menuOpen ? ' is-menu-open' : ''}`}>
      <aside className="pr-sidebar">
        <div className="pr-brand">
          <strong>Flython</strong>
          <span>Staff · Pricing &amp; Finance</span>
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
        <nav id="pr-nav" aria-label="Pricing and finance" onClick={() => setMenuOpen(false)}>
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
      </aside>

      <main className="pr-main">
        <header className="pr-header">
          <div>
            <p className="pr-tags">
              <span className="pr-tag is-dark">Feature 4</span>
              <span className="pr-tag is-yellow">Pricing core</span>
            </p>
            <h1 className="pr-title">{title}</h1>
            <p className="pr-subtitle">{description}</p>
          </div>
          {/* The simulation clock (Platform) has no API yet, so no date is shown rather than a made-up one. */}
          <span className="pr-sim-chip" title="Waiting for the simulation clock API">
            Simulated today · not connected
          </span>
        </header>
        {children}
      </main>
    </div>
  )
}
