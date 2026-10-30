import { Link } from '@tanstack/react-router'
import { useRef, useState, type ReactNode } from 'react'
import { openConflictCount } from '../connected'
import { useShowCongestion } from '../hooks/useShowCongestion'
import { useTableLabels } from '../hooks/useTableLabels'
import { TopBar } from './TopBar'

// `to` is set once a page exists; the rest show as "coming soon" so the menu matches the design.
// ponytail: lives in this feature until the platform team moves the staff layout to a shared place.
const NAV: {
  heading: string
  items: {
    label: string
    to?:
      | '/schedule-board'
      | '/approvals'
      | '/conflicts'
      | '/congestion'
      | '/disruption-log'
      | '/airports'
      | '/routes'
      | '/patterns'
      | '/approver-console'
      | '/settings'
      | '/airport-fees'
      | '/approval-policy'
  }[]
}[] = [
  {
    heading: 'Flight operations',
    items: [
      { label: 'Schedule board', to: '/schedule-board' },
      { label: 'Approvals', to: '/approvals' },
      { label: 'Conflicts', to: '/conflicts' },
      { label: 'Congestion', to: '/congestion' },
      { label: 'Disruption log', to: '/disruption-log' },
    ],
  },
  {
    heading: 'Network data',
    items: [
      { label: 'Airports', to: '/airports' },
      { label: 'Routes', to: '/routes' },
      { label: 'Patterns', to: '/patterns' },
    ],
  },
  {
    heading: 'Simulation & settings',
    items: [
      { label: 'Approver console', to: '/approver-console' },
      { label: 'Settings', to: '/settings' },
    ],
  },
]

// Sidebar plus the page. On a phone the sidebar becomes a full-screen menu behind a hamburger button.
export function StaffShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const content = useRef<HTMLDivElement>(null)
  useTableLabels(content)
  const [showCongestion, setShowCongestion] = useShowCongestion()
  const openConflicts = openConflictCount()

  return (
    <div className="fs-shell">
      <nav className={`fs-sidebar${open ? ' fs-sidebar-open' : ''}`} aria-label="Staff">
        <button type="button" className="fs-menu-close" aria-label="Close menu" onClick={() => setOpen(false)}>
          ✕
        </button>
        <p className="fs-brand">Airlines</p>
        <p className="fs-brand-sub">Staff · Network operations</p>
        {NAV.map((section) => (
          <div key={section.heading}>
            <p className="fs-nav-heading">{section.heading}</p>
            {section.items
              .filter((item) => showCongestion || item.to !== '/congestion')
              .map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="fs-nav-link"
                    activeProps={{ className: 'fs-nav-link fs-nav-active' }}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                    {item.to === '/conflicts' && openConflicts !== null && (
                      <>
                        <span className="fs-nav-badge">{openConflicts}</span>
                        <span className="fs-nav-open">· {openConflicts} open</span>
                      </>
                    )}
                  </Link>
                ) : (
                  <span key={item.label} className="fs-nav-link fs-nav-soon" aria-disabled="true">
                    {item.label}
                  </span>
                ),
              )}
          </div>
        ))}
        <label className="fs-menu-check">
          <input type="checkbox" checked={showCongestion} onChange={(e) => setShowCongestion(e.target.checked)} />
          Show congestion (stretch level 1)
        </label>
        <div className="fs-sidebar-foot">
          <p className="fs-foot-title">Staff</p>
          <p>
            One staff role: every signed-in staff member can read and change everything in Feature 2. Example times are Bangkok time
            (UTC+07:00).
          </p>
        </div>
      </nav>
      <div className="fs-content" ref={content}>
        <header className="fs-mobilebar">
          <span className="fs-mobile-brand">Airlines</span>
          <button type="button" className="fs-menu-button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
              <path d="M0 1h18M0 7h18M0 13h18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </header>
        <TopBar showCongestion={showCongestion} onShowCongestion={setShowCongestion} />
        {children}
      </div>
    </div>
  )
}
