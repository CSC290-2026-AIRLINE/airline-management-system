import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import screeningIcon from '../assets/screening.svg'
import watchlistIcon from '../assets/watchlist.svg'
import '../fonts.css'
import '../screening.css'

export function ScreeningShell({
  children,
  reviewing = false,
  held,
  onQueue,
  onSignOut,
  activeTab = 'queue',
  navigationDisabled = false,
}: {
  children: ReactNode
  reviewing?: boolean
  held?: number
  onQueue?: () => void
  onSignOut?: () => void | Promise<void>
  activeTab?: 'queue' | 'watchlist'
  navigationDisabled?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const sidebarId = useId()
  const queueClass = activeTab === 'queue' ? 'sq-tab-active' : undefined
  const queueLabel = (
    <>
      <img src={screeningIcon} alt="" />
      Screening Queue{' '}
      {held !== undefined && held > 0 && (
        <span className="sq-held-count">
          <span>{held}</span>
          <span className="sq-desktop-only"> held</span>
        </span>
      )}
    </>
  )
  async function signOut() {
    if (!onSignOut || signingOut || navigationDisabled) return
    setSigningOut(true)
    setSignOutError('')
    try {
      await onSignOut()
    } catch {
      setSignOutError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <div className="sq-app">
      <aside id={sidebarId} className={`sq-sidebar ${menuOpen ? 'sq-sidebar-open' : ''}`}>
        <div className="sq-brand">Airlines</div>
        <div className="sq-brand-line" />
        <p className="sq-workspace">ADMIN WORKSPACE</p>
        <nav aria-label="Staff navigation">
          <button disabled title="Customer Search is not available in this branch">
            Customer Search
          </button>
          {onQueue ? (
            <button
              className="sq-nav-active"
              disabled={navigationDisabled}
              onClick={() => {
                onQueue()
                setMenuOpen(false)
              }}
            >
              Security Screening
            </button>
          ) : (
            <Link
              viewTransition
              preload="render"
              to="/screening-queue"
              search={{ status: 'needs-review' }}
              className="sq-nav-active"
              disabled={navigationDisabled}
            >
              Security Screening
            </Link>
          )}
        </nav>
        <div className="sq-account">
          <strong>Administrator</strong>
          <p>Navigation follows assigned staff permissions.</p>
          <button disabled={!onSignOut || signingOut || navigationDisabled} onClick={() => void signOut()}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>
      <div className="sq-main">
        <header className="sq-header">
          <div className="sq-mobile-header">
            <span className="sq-brand">Airlines</span>
            <span className="sq-staff">STAFF</span>
            <button
              className="sq-menu"
              aria-label="Toggle staff menu"
              aria-expanded={menuOpen}
              aria-controls={sidebarId}
              onClick={() => setMenuOpen(!menuOpen)}
            >
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
            {onQueue ? (
              <button
                className={queueClass}
                onClick={onQueue}
                disabled={navigationDisabled}
                aria-current={activeTab === 'queue' ? 'page' : undefined}
              >
                {queueLabel}
              </button>
            ) : (
              <Link
                viewTransition
                preload="render"
                to="/screening-queue"
                search={{ status: 'needs-review' }}
                className={queueClass}
                disabled={navigationDisabled}
                aria-current={activeTab === 'queue' ? 'page' : undefined}
              >
                {queueLabel}
              </Link>
            )}
            <Link
              viewTransition
              preload="render"
              to="/watchlist"
              className={activeTab === 'watchlist' ? 'sq-tab-active' : undefined}
              disabled={navigationDisabled}
              aria-current={activeTab === 'watchlist' ? 'page' : undefined}
            >
              <img src={watchlistIcon} alt="" />
              Watchlist
            </Link>
          </nav>
        </header>
        <main className="sq-content">
          {signOutError && <p role="alert">{signOutError}</p>}
          {children}
        </main>
      </div>
    </div>
  )
}
