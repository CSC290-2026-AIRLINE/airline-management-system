import { useState } from 'react'
import { Link } from '@tanstack/react-router'
// The shared header's look, reused as is (the shared FlythonHeader itself needs a signed-in app session).
import '../../../components/FlythonHeader.css'
import './GuestReportHeader.css'

/**
 * The Flython header for a signed-out visitor on Report a lost bag. Only public destinations: the home page, this page,
 * and sign-in (which comes back here). No profile, signed-in status or case access, and no app session needed.
 */
export function GuestReportHeader() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)

  return (
    <header className="flython-header">
      <div className="flython-header__bar">
        <Link className="flython-header__brand" to="/" aria-label="Flython Airlines home">
          <span aria-hidden="true" className="flython-header__mark">
            <span />
            <span />
            <span />
          </span>
          <span className="flython-header__brand-text">
            <span className="flython-header__wordmark">Flython</span>
            <span className="flython-header__airline">AIRLINES</span>
          </span>
        </Link>

        <button
          aria-expanded={isNavigationOpen}
          aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="flython-header__menu-toggle"
          type="button"
          onClick={() => setIsNavigationOpen((open) => !open)}
        >
          <span aria-hidden="true" className={`flython-header__menu-icon${isNavigationOpen ? ' flython-header__menu-icon--open' : ''}`}>
            <span />
            <span />
            <span />
          </span>
        </button>

        <nav aria-label="Guest navigation" className={`flython-header__nav${isNavigationOpen ? ' flython-header__nav--open' : ''}`}>
          <div className="flython-header__menu-heading">
            <span>Menu</span>
            <button type="button" aria-label="Close navigation menu" onClick={() => setIsNavigationOpen(false)}>
              ×
            </button>
          </div>
          <div className="flython-header__menu-links">
            <Link
              aria-current="page"
              className="flython-header__link flython-header__link--active"
              to="/report-lost-bag"
              onClick={() => setIsNavigationOpen(false)}
            >
              Lost bag
            </Link>
          </div>
        </nav>

        <Link className="flython-header__profile guest-report-header__sign-in" to="/login" search={{ redirect: '/report-lost-bag' }}>
          Sign in
        </Link>
      </div>
    </header>
  )
}
