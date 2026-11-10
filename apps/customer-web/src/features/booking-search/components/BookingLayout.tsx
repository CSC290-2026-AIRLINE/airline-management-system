import type { ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import './booking-navigation.css'

// Feature-local until the platform provides a shared customer header.
export function BookingLayout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { isSignedIn, user } = useUser()
  const initials = [user?.firstName?.[0] ?? '', user?.lastName?.[0] ?? ''].join('').toUpperCase()
  const links = [
    { href: '/search', label: 'Book', match: ['/search', '/booking'] },
    { href: '/bookings', label: 'My Trips', match: ['/bookings'] },
  ]
  return (
    <div className="f3-customer-layout">
      <header className="f3-customer-header">
        <Link to="/search" className="f3-customer-brand" aria-label="Flython home">
          <svg className="f3-customer-mark" viewBox="0 0 56 28" aria-hidden="true" focusable="false">
            <path d="M3 15C16 15 30 10 44 3L52 2C44 10 30 17 16 19L3 19Z" fill="#fca311" />
            <path d="M3 20C16 20 30 16 44 8L52 4C46 12 32 20 16 24L3 24Z" fill="#14213d" />
          </svg>
          <span className="f3-customer-wordmark">
            Flython
            <small>Airlines</small>
          </span>
        </Link>
        <nav aria-label="Customer navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              aria-current={link.match.some((path) => location.pathname.startsWith(path)) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
          {isSignedIn ? (
            <Link to="/dashboard" className="f3-customer-profile">
              <span className="f3-customer-avatar" aria-hidden="true">
                {initials || '?'}
              </span>
              Profile
            </Link>
          ) : (
            <Link to="/login" className="f3-customer-profile">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      {children}
    </div>
  )
}
