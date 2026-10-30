import type { ReactNode } from 'react'
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

  return (
    <div className="f9-root">
      <aside className="f9-sidebar">
        <div className="f9-sidebar__logo">Airlines</div>
        <div className="f9-sidebar__accent" />
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
