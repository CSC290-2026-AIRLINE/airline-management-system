import { Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import type { ApiError } from '../api/client'
import { useCustomerTrips } from '../api/useCustomerTrips'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import controls from '../styles/controls.module.css'
import { BookingCard } from './BookingCard'
import type { TripTab } from './booking-card-model'
import styles from './MyBookingsPage.module.css'
import '../styles/tokens.css'

export function MyBookingsPage({ tab }: { tab: TripTab }) {
  const { trips, error, isLoading, reload } = useCustomerTrips()
  // The references whose hold reached zero: the expiry job moves them to the Past tab.
  const [expiredRefs, setExpiredRefs] = useState<ReadonlySet<string>>(() => new Set())

  const handleExpire = useCallback(
    (reference: string) => {
      setExpiredRefs((previous) => {
        if (previous.has(reference)) {
          return previous
        }
        return new Set(previous).add(reference)
      })
      void reload()
    },
    [reload],
  )

  const items = tab === 'upcoming' ? trips.upcoming : trips.past

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.title}>
          <h1>My Trips</h1>
          <p className={styles.subtitle}>Your bookings, newest departure first.</p>
        </div>

        <Link to="/search" className={`${controls.primary} ${styles.bookButton}`}>
          Book a flight
        </Link>

        <nav className={styles.tabs} aria-label="Bookings">
          <Link
            to="/bookings"
            search={{ tab: 'upcoming' }}
            className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
            aria-current={tab === 'upcoming' ? 'page' : undefined}
          >
            Upcoming
          </Link>
          <Link
            to="/bookings"
            search={{ tab: 'past' }}
            className={`${styles.tab} ${tab === 'past' ? styles.tabActive : ''}`}
            aria-current={tab === 'past' ? 'page' : undefined}
          >
            Past
          </Link>
        </nav>

        <div className={styles.sectionTitle}>
          <h2>{tab === 'upcoming' ? 'Upcoming bookings' : 'Past bookings'}</h2>
          <span className={styles.countChip}>{items.length}</span>
        </div>

        <div className={styles.cards}>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={() => void reload()} /> : null}
          {!isLoading && !error && items.length === 0 ? <EmptyState tab={tab} /> : null}

          {items.map((item) => (
            <BookingCard
              key={item.bookingId}
              item={item}
              tab={tab}
              serverNow={trips.serverNow}
              expired={expiredRefs.has(item.reference)}
              onExpire={handleExpire}
            />
          ))}
        </div>

        <p className={styles.banner}>
          Held bookings show a countdown. When it reaches zero the seats are released and the booking expires.
        </p>
      </div>
    </main>
  )
}

function LoadingState() {
  return (
    <section className={styles.messageCard} aria-busy="true">
      <h2>Loading your trips…</h2>
      <p className={styles.muted}>Checking your bookings.</p>
    </section>
  )
}

function EmptyState({ tab }: { tab: TripTab }) {
  return (
    <section className={styles.messageCard}>
      <h2>{tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}</h2>
      <p className={styles.muted}>
        {tab === 'upcoming'
          ? 'Book a flight to plan your next trip.'
          : 'The flights you have flown and the bookings you cancelled will show up here.'}
      </p>
      {tab === 'upcoming' ? (
        <div className={styles.messageActions}>
          <Link to="/search" className={controls.primary}>
            Book a flight
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <section className={styles.messageCard}>
      <ApiErrorBanner error={error} />
      <div className={styles.messageActions}>
        <button type="button" className={controls.secondary} onClick={onRetry}>
          Try again
        </button>
        <Link to="/search" className={controls.secondary}>
          Search flights
        </Link>
      </div>
    </section>
  )
}
