import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
// The shared header's look, reused as is (the shared FlythonHeader itself needs a signed-in app session).
import '../../../components/FlythonHeader.css'
import './GuestReportHeader.css'

/**
 * The Flython header for a signed-out visitor on the public baggage pages. Only public destinations: the home page,
 * Report a lost bag, guest case tracking, and sign-in. No profile, signed-in status or signed-in case access, and no app
 * session needed.
 */
export function GuestReportHeader() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const pathname = useLocation({ select: (location) => location.pathname })
  const isTracking = pathname === '/track-lost-bag'
  // After signing in: back to reporting, or on to the signed-in My bag case when the guest was tracking a case.
  const signInRedirect = isTracking ? '/lost-bag-case' : '/report-lost-bag'

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
              aria-current={isTracking ? undefined : 'page'}
              className={isTracking ? 'flython-header__link' : 'flython-header__link flython-header__link--active'}
              to="/report-lost-bag"
              onClick={() => setIsNavigationOpen(false)}
            >
              Lost bag
            </Link>
            <Link
              aria-current={isTracking ? 'page' : undefined}
              className={isTracking ? 'flython-header__link flython-header__link--active' : 'flython-header__link'}
              to="/track-lost-bag"
              onClick={() => setIsNavigationOpen(false)}
            >
              My bag case
            </Link>
          </div>
        </nav>

        <Link className="flython-header__profile guest-report-header__sign-in" to="/login" search={{ redirect: signInRedirect }}>
          Sign in
        </Link>
      </div>
    </header>
  )
}
