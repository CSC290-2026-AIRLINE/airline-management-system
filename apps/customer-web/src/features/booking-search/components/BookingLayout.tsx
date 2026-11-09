import type { ReactNode } from 'react'
import './booking-navigation.css'

// Feature-local until the platform provides a shared customer header.
export function BookingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="f3-customer-layout">
      <header className="f3-customer-header">
        <a href="/search" className="f3-customer-brand" aria-label="Flython home">
          <span aria-hidden="true">✈</span> Flython
        </a>
        <nav aria-label="Customer navigation">
          <a href="/search" aria-current="page">
            Book
          </a>
          <a href="/bookings">My Trips</a>
          <a href="/dashboard" className="f3-customer-profile">
            My account
          </a>
        </nav>
      </header>
      {children}
    </div>
  )
}
