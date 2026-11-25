import { Link } from '@tanstack/react-router'
import { Button } from '@customer-web/components/ui/button'
import { PageShell } from '../components/PageShell'
import type { ApiError } from '../api/client'
import { useBooking } from '../api/useBooking'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { heldSeatCount } from '../lib/booking'
import { ConfirmedState } from '../review-pay/ConfirmedState'
import type { HoldExpiredReason } from './types'
import controls from '../styles/controls'

export function HoldExpiredPage({ reference, reason }: { reference: string; reason: HoldExpiredReason }) {
  const { booking, error, isLoading, reload } = useBooking(reference)

  if (isLoading && !booking) {
    return <LoadingState reference={reference} />
  }

  if (error) {
    return error.status === 404 ? <NotFoundState reference={reference} /> : <ErrorState error={error} onRetry={() => void reload()} />
  }

  if (!booking) {
    return <NotFoundState reference={reference} />
  }

  if (booking.status === 'confirmed') {
    return <ConfirmedState booking={booking} />
  }

  const holdStillActive = booking.status === 'held' && Date.parse(booking.holdExpiresAt) > Date.parse(booking.serverNow)
  if (holdStillActive) {
    return <ActiveHoldState reference={reference} />
  }

  const seatCount = heldSeatCount(booking)
  const seatLabel = seatCount > 0 ? `${seatCount} held seat${seatCount === 1 ? '' : 's'}` : 'held seats'
  const chip = reason === 'refunded' ? 'Payment refunded' : reason === 'cancelled' ? 'Booking cancelled' : 'Hold expired'
  const title =
    reason === 'refunded' ? 'Your seats were gone' : reason === 'cancelled' ? 'Your booking was cancelled' : 'Your seats were released'
  const body =
    reason === 'refunded'
      ? `Booking ${reference} expired before payment and its seats were no longer available. The payment was refunded in full.`
      : reason === 'cancelled'
        ? `Booking ${reference} was cancelled before payment, so the ${seatLabel} ${seatCount === 1 ? 'was' : 'were'} released. Nothing was charged.`
        : `Booking ${reference} was not paid within 15 minutes, so the ${seatLabel} ${seatCount === 1 ? 'is' : 'are'} back on sale and the booking is marked expired. Nothing was charged.`

  return (
    <PageShell width="narrow">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm [&_h1]:m-0">
          <span className="inline-flex w-fit items-center rounded-md border border-warn/25 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">
            {chip}
          </span>
          <h1>{title}</h1>
          <p className="text-muted-foreground">{body}</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/search" className={controls.primary}>
              Search again
            </Link>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Prices and seat counts may have changed. If the seats are gone, search will show what is left.
          </p>
        </section>
      </div>
    </PageShell>
  )
}

function ActiveHoldState({ reference }: { reference: string }) {
  return (
    <PageShell width="narrow">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm [&_h1]:m-0">
          <span className="inline-flex w-fit items-center rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Hold active
          </span>
          <h1>Your hold is still active</h1>
          <p className="text-muted-foreground">Booking {reference} has not expired yet. Return to Review &amp; pay to finish.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/review-pay/$reference" params={{ reference }} className={controls.primary}>
              Return to Review &amp; pay
            </Link>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  )
}

function LoadingState({ reference }: { reference: string }) {
  return (
    <PageShell width="narrow">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm [&_h1]:m-0" aria-busy="true">
          <span className="inline-flex w-fit items-center rounded-md border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Hold expired
          </span>
          <h1>Loading booking…</h1>
          <p className="text-muted-foreground">Checking what happened to booking {reference}.</p>
        </section>
      </div>
    </PageShell>
  )
}

/**
 * The booking could not be read, so the page cannot say what happened to the hold. The customer gets the error and a
 * way to try again instead of a copy about seats that may still be held.
 */
function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <PageShell width="narrow">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm [&_h1]:m-0">
          <ApiErrorBanner error={error} />
          <h1>We could not load this booking</h1>
          <p className="text-muted-foreground">
            The booking could not be read, so we cannot tell you yet what happened to its hold. Try again in a moment.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
            <Link to="/bookings" className={controls.secondary}>
              Go to My Trips
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <PageShell width="narrow">
      <div className="space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm [&_h1]:m-0">
          <span className="inline-flex w-fit items-center rounded-md border border-warn/25 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">
            Not found
          </span>
          <h1>We couldn&apos;t find booking {reference}</h1>
          <p className="text-muted-foreground">Check the reference or go back to your trips.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/bookings" className={controls.primary}>
              Go to My Trips
            </Link>
            <Link to="/search" className={controls.secondary}>
              Search flights
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  )
}
