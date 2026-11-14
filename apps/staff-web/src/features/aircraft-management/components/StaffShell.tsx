import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import '../aircraft-management.css'

export type StaffTab = 'fleet' | 'types' | 'readiness'

const TABS: { to: string; label: string; id: StaffTab }[] = [
  { to: '/aircraft', label: 'Fleet', id: 'fleet' },
  { to: '/aircraft-types', label: 'Aircraft Types', id: 'types' },
  { to: '/readiness', label: 'Readiness', id: 'readiness' },
]

/**
 * The sidebar shows the whole staff workspace. Only the three Feature 9 areas are implemented here,
 * so the other sections are drawn as they appear in the design without pretending to be links.
 */
const SIDEBAR_SECTIONS = [
  { label: 'Reports & Analytics', marker: '', child: false },
  { label: 'Operations', marker: '+', child: false },
  { label: 'Commercial', marker: '+', child: false },
  { label: 'Airport & Onboard', marker: '+', child: false },
  { label: 'Customer Management', marker: '-', child: false },
  { label: 'Customer Search', marker: '', child: true },
  { label: 'Service & Compensation', marker: '', child: true },
  { label: 'Loyalty Programme', marker: '', child: true },
  { label: 'Administration', marker: '', child: false },
] as const

interface StaffShellProps {
  activeTab: StaffTab
  children: ReactNode
}

export function StaffShell({ activeTab, children }: StaffShellProps) {
  const { user, logout } = useAppAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="f9-root">
      {/* Mobile Top Navbar from Figma M-01 */}
      <div className="f9-mobile-bar">
        <div className="f9-mobile-bar__brand">
          <svg width="32" height="20" viewBox="0 0 54 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8C18 8 38 2 52 2C40 6 24 12 14 14C9 15 5 12 4 8Z" fill="#F59E0B" />
            <path d="M2 17C16 17 35 10 47 10C33 14 18 20 9 22C5 23 3 21 2 17Z" fill="#FFFFFF" />
            <path d="M0 26C12 26 28 20 38 20C26 23 14 28 6 30C2 31 0 29 0 26Z" fill="#94A3B8" />
          </svg>
          <div className="f9-sidebar__brand-text">
            <span className="f9-sidebar__brand-title" style={{ fontSize: '20px' }}>Flython</span>
            <span className="f9-sidebar__brand-sub" style={{ fontSize: '7px' }}>AIRLINES</span>
          </div>
        </div>
        <button
          type="button"
          className="f9-mobile-bar__toggle"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className="f9-mobile-subbar">
        <span>ADMINISTRATOR / FULL ACCESS</span>
        <span className="f9-mobile-subbar__dot">●</span>
        <span>SIMULATION TIME</span>
      </div>

      {isMobileMenuOpen && (
        <div className="f9-sidebar-backdrop" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside className={`f9-sidebar ${isMobileMenuOpen ? 'f9-sidebar--mobile-open' : ''}`}>
        <div className="f9-sidebar__brand">
          <svg className="f9-sidebar__logo-icon" width="40" height="26" viewBox="0 0 54 34" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8C18 8 38 2 52 2C40 6 24 12 14 14C9 15 5 12 4 8Z" fill="#F59E0B" />
            <path d="M2 17C16 17 35 10 47 10C33 14 18 20 9 22C5 23 3 21 2 17Z" fill="#FFFFFF" />
            <path d="M0 26C12 26 28 20 38 20C26 23 14 28 6 30C2 31 0 29 0 26Z" fill="#94A3B8" />
          </svg>
          <div className="f9-sidebar__brand-text">
            <span className="f9-sidebar__brand-title">Flython</span>
            <span className="f9-sidebar__brand-sub">AIRLINES</span>
          </div>
        </div>
        <div className="f9-sidebar__eyebrow">ADMIN WORKSPACE</div>

        <nav className="f9-sidebar__nav" aria-label="Workspace sections">
          {SIDEBAR_SECTIONS.map((section) => {
            const classes = ['f9-navitem']
            if (section.label === 'Customer Management' || section.label === 'Customer Search') {
              classes.push('f9-navitem--deep')
            }
            if (section.child) {
              classes.push('f9-navitem--child')
            }
            return (
              <div key={section.label} className={classes.join(' ')}>
                {section.marker && <span className="f9-navitem__marker">{section.marker}</span>}
                <span>{section.label}</span>
              </div>
            )
          })}
        </nav>

        <div className="f9-sidebar__foot">
          <div className="f9-sidebar__user">Administrator</div>
          <p className="f9-sidebar__note">Navigation follows assigned staff permissions.</p>
          <button type="button" className="f9-sidebar__signout" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="f9-main">
        <div className="f9-content">
          <header className="f9-topbar">
            <div className="f9-pills">
              <span className="f9-pill f9-pill--primary">FEATURE 9</span>
              <span className="f9-pill f9-pill--staff">STAFF VIEW</span>
            </div>
            <div className="f9-topbar__user">{user ? `Staff · ${user.type}` : 'Staff'}</div>
          </header>

          <h1 className="f9-title">Aircraft Management</h1>
          <p className="f9-subtitle">
            Fleet registry, aircraft types and seat maps, maintenance and turnaround readiness. Staff (admin) only.
          </p>

          <nav className="f9-tabs" aria-label="Feature 9 sections">
            {TABS.map((tab) => (
              <Link
                key={tab.id}
                to={tab.to}
                className={tab.id === activeTab ? 'f9-tab f9-tab--active' : 'f9-tab'}
                aria-current={tab.id === activeTab ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {children}
        </div>
      </main>
    </div>
  )
}
