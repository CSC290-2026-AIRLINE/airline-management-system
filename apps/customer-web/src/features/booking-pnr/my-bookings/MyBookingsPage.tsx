import { Link } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { Clock, PlaneTakeoff, Plus } from 'lucide-react'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { EmptyState as EmptyList } from '@customer-web/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
import type { ApiError } from '../api/client'
import { useCustomerTrips } from '../api/useCustomerTrips'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { MessageCard, PageShell, PageTitle } from '../components/PageShell'
import { BookingCard } from './BookingCard'
import type { TripTab } from './booking-card-model'

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
    <PageShell className="max-w-3xl">
      <PageTitle
        title="My Trips"
        subtitle="Your bookings, most recently booked first."
        actions={
          <Button asChild>
            <Link to="/search">
              <Plus />
              Book a flight
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The tab lives in the URL, so each trigger is a link. */}
        <Tabs value={tab}>
          <TabsList aria-label="Bookings">
            <TabsTrigger value="upcoming" asChild>
              <Link to="/bookings" search={{ tab: 'upcoming' }}>
                Upcoming
              </Link>
            </TabsTrigger>
            <TabsTrigger value="past" asChild>
              <Link to="/bookings" search={{ tab: 'past' }}>
                Past
              </Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {tab === 'upcoming' ? 'Upcoming bookings' : 'Past bookings'}
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
        </p>
      </div>

      <div className="space-y-3">
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

      <p className="text-sm text-muted-foreground">
        Held bookings show a countdown. When it reaches zero the seats are released and the booking expires.
      </p>
    </PageShell>
  )
}

function LoadingState() {
  return (
    <MessageCard title="Loading your trips…" busy>
      <p className="text-sm text-muted-foreground">Checking your bookings.</p>
    </MessageCard>
  )
}

function EmptyState({ tab }: { tab: TripTab }) {
  return (
    <EmptyList
      icon={tab === 'upcoming' ? PlaneTakeoff : Clock}
      title={tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings yet'}
      action={
        tab === 'upcoming' ? (
          <Button asChild>
            <Link to="/search">Book a flight</Link>
          </Button>
        ) : undefined
      }
    >
      {tab === 'upcoming'
        ? 'Book a flight to plan your next trip.'
        : 'The flights you have flown and the bookings you cancelled will show up here.'}
    </EmptyList>
  )
}

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <MessageCard title="We could not load your trips">
      <ApiErrorBanner error={error} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/search">Search flights</Link>
        </Button>
      </div>
    </MessageCard>
  )
}
