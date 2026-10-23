import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import screeningIcon from '../assets/screening.svg'
import watchlistIcon from '../assets/watchlist.svg'

export function ScreeningShell({
  children,
  reviewing,
  held,
  onQueue,
  onSignOut,
}: {
  children: ReactNode
  reviewing: boolean
  held: number
  onQueue: () => void
  onSignOut: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="sq-app">
      <aside className={`sq-sidebar ${menuOpen ? 'sq-sidebar-open' : ''}`}>
        <div className="sq-brand">Airlines</div>
        <div className="sq-brand-line" />
        <p className="sq-workspace">ADMIN WORKSPACE</p>
        <nav aria-label="Staff navigation">
          <Link to="/dashboard">Customer Search</Link>
          <button
            className="sq-nav-active"
            onClick={() => {
              onQueue()
              setMenuOpen(false)
            }}
          >
            Security Screening
          </button>
        </nav>
        <div className="sq-account">
          <strong>Administrator</strong>
          <p>Navigation follows assigned staff permissions.</p>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <div className="sq-main">
        <header className="sq-header">
          <div className="sq-mobile-header">
            <span className="sq-brand">Airlines</span>
            <span className="sq-staff">STAFF</span>
            <button className="sq-menu" aria-label="Toggle staff menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className="sq-heading sq-desktop-heading">
            <h1>{reviewing ? 'Screening review' : 'Security Screening'}</h1>
          </div>
          <div className="sq-heading sq-mobile-heading">
            <h1>Security Screening</h1>
          </div>
          <nav className="sq-tabs" aria-label="Security screening">
            <button className="sq-tab-active" onClick={onQueue}>
              <img src={screeningIcon} alt="" />
              Screening Queue{' '}
              <span className="sq-held-count">
                <span>{held}</span>
                <span className="sq-desktop-only"> held</span>
              </span>
            </button>
            <button>
              <img src={watchlistIcon} alt="" />
              Watchlist
            </button>
          </nav>
        </header>
        <main className="sq-content">{children}</main>
      </div>
    </div>
  )
}
