import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useState } from 'react'
import { MyAccessWidget } from './components/MyAccessWidget'
import './AdminShell.css'

/** Three tabs in display order. `current` is read from the URL so a deep link lands on the right tab. Paths match the
 * spec: `/admin/staff` for the staff & roles tab (friend's page) and `/admin/roles` for role access. */
const TABS = [
  { to: '/admin/staff', label: 'Staff & roles' },
  { to: '/admin/roles', label: 'Role access' },
  { to: '/admin/audit-log', label: 'Audit log' },
] as const

export function AdminShell() {
  const { logout } = useAppAuth()
  const { location } = useRouterState()
  const [collapsed, setCollapsed] = useState(false)
  /* Only meaningful below the 768px breakpoint, where the sidebar is a top bar and the nav/footer drop into a
     drawer. Kept separate from `collapsed` because the two mean opposite things: collapsing narrows a sidebar that
     is already on screen, whereas opening reveals chrome that is hidden by default on mobile. */
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}${navOpen ? ' is-nav-open' : ''}`}>
      <aside className="admin-sidebar">
        <div className="brand">
          <span className="brand-word">
            {collapsed ? (
              <span className="brand-ink brand-ink--rule">A</span>
            ) : (
              <>
                <span className="brand-ink brand-ink--rule">Air</span>
                <span className="brand-ink">lines</span>
              </>
            )}
          </span>
        </div>

        {/* Mobile-only bar toggle. The desktop sidebar has its own collapse button lower down. */}
        <button
          type="button"
          className="btn-mobile-nav"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
        >
          Admin
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="1" y1="3.5" x2="13" y2="3.5" />
            <line x1="1" y1="7" x2="13" y2="7" />
            <line x1="1" y1="10.5" x2="13" y2="10.5" />
          </svg>
        </button>

        {/* `display: contents` on desktop so these stay direct flex items of the column; on mobile it becomes the
            drawer panel that drops below the bar. */}
        <div className="sidebar-drawer">
          <p className="workspace-label">ADMIN WORKSPACE</p>
          <nav className="sidebar-nav" aria-label="Workspace">
            <Link to="/admin/roles" className="sidebar-item is-active" activeOptions={{ exact: false }}>
              <span className="gold-bar" />
              Administration
            </Link>
          </nav>
          <footer className="sidebar-footer">
            <p className="who">Administrator</p>
            <p className="muted">Menu shows the screens your role can open.</p>
            <button type="button" className="btn-signout" onClick={() => void logout()}>
              Sign out
            </button>
            <MyAccessWidget />
          </footer>
        </div>

        <button
          type="button"
          className="btn-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {collapsed ? <polyline points="5,3 10,7 5,11" /> : <polyline points="9,3 4,7 9,11" />}
          </svg>
        </button>
      </aside>

      <main className="admin-main">
        <header className="shell-header">
          <h1>ADMINISTRATION</h1>
          <p>Manage staff accounts and roles, choose which screens each role can open, and review the audit log of every feature.</p>
        </header>

        <nav className="tab-bar" aria-label="Admin tabs">
          {TABS.map((t) => {
            const active = location.pathname === t.to || location.pathname.startsWith(t.to + '/')
            return (
              <Link key={t.to} to={t.to} className={`tab ${active ? 'is-active' : ''}`}>
                {t.label}
              </Link>
            )
          })}
        </nav>

        <div className="page-body-host">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
