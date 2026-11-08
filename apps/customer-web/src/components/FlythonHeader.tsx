import { useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useAppAuth } from '../auth/AuthProvider'
import './FlythonHeader.css'

function profileInitial(email: string | undefined): string {
  return (email?.trim().slice(0, 2) || 'FL').toUpperCase()
}

export function FlythonHeader() {
  const { user } = useAppAuth()
  const pathname = useLocation({ select: (location) => location.pathname })
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)

  return (
    <header className="flython-header">
      <div className="flython-header__bar">
        <Link className="flython-header__brand" to="/dashboard" aria-label="Flython Airlines home">
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

        <nav aria-label="Customer navigation" className={`flython-header__nav${isNavigationOpen ? ' flython-header__nav--open' : ''}`}>
          <Link
            aria-current={pathname === '/report-lost-bag' ? 'page' : undefined}
            className={pathname === '/report-lost-bag' ? 'flython-header__link flython-header__link--active' : 'flython-header__link'}
            to="/report-lost-bag"
            onClick={() => setIsNavigationOpen(false)}
          >
            Lost bag
          </Link>
          <Link
            aria-current={pathname === '/lost-bag-case' ? 'page' : undefined}
            className={pathname === '/lost-bag-case' ? 'flython-header__link flython-header__link--active' : 'flython-header__link'}
            to="/lost-bag-case"
            onClick={() => setIsNavigationOpen(false)}
          >
            My bag case
          </Link>
        </nav>

        <div aria-label="Signed-in profile" className="flython-header__profile" role="group">
          <span aria-hidden="true" className="flython-header__avatar">
            {profileInitial(user?.email)}
          </span>
          <span>Profile</span>
        </div>
      </div>
    </header>
  )
}
