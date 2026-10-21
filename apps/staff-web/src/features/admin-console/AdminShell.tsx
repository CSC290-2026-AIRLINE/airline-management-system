import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useState } from 'react'
import './AdminShell.css'

/** Three tabs in display order. `current` is read from the URL so a deep link lands on the right tab. */
const TABS = [
  { to: '/admin/staff-roles', label: 'Staff & roles' },
  { to: '/admin/role-access', label: 'Role access' },
  { to: '/admin/audit-log', label: 'Audit log' },
] as const

export function AdminShell() {
  const { logout } = useAppAuth()
  const { location } = useRouterState()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
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
        <p className="workspace-label">ADMIN WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="Workspace">
          <Link to="/admin/role-access" className="sidebar-item is-active" activeOptions={{ exact: false }}>
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
        </footer>
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
