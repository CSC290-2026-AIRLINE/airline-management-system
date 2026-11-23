import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError } from '../api/client'
import type { BookingDetail, BookingStatus, CancelBookingResult } from '../api/types'
import { useBooking } from '../api/useBooking'
import { ApiErrorBanner } from '../components/ApiErrorBanner'
import { HoldBanner } from '../components/HoldBanner'
import { StatusChip } from '../components/StatusChip'
import { formatDateWithYear, formatMoney } from '../lib/format'
import { CancelBookingDialog } from './CancelBookingDialog'
import { FeatureAction } from './FeatureAction'
import { FlightsCard } from './FlightsCard'
import { PassengersCard } from './PassengersCard'
import { PaymentCard } from './PaymentCard'
import {
  bookingChip,
  CHANGE_BOOKING_DISABLED,
  CHECK_IN_DISABLED,
  COMPLAINT_DISABLED,
  LOST_BAG_DISABLED,
  MEALS_DISABLED,
  orderingLabel,
  orderingWindow,
  partyLabel,
} from './booking-detail-model'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { MessageCard, PageShell } from '../components/PageShell'
import { BookingSeatChangesPanel } from '../seats/BookingSeatChangesPanel'
import { BookingAssistancePanel } from '../assistance/BookingAssistancePanel'

// How long the page waits before it asks the server again whether the hold is over. The expiry sweep runs every
// minute, so a booking can still read as 'held' for a little while after the countdown reached zero.
const RELOAD_AFTER_EXPIRY_MS = 15_000

/**
 * The Booking Detail page (B12, design frames 08 and 08a): the flights of a booking with their seats and tickets, the
 * passengers with their assistance requests, the payment and the links to the features that are not connected yet.
 */
export function BookingDetailPage({ reference }: { reference: string }) {
  const { booking, error, isLoading, reload } = useBooking(reference)

  if (isLoading && !booking) {
    return <LoadingState />
  }

  if (error) {
    return error.status === 404 ? <NotFoundState reference={reference} /> : <ErrorState error={error} onRetry={() => void reload()} />
  }

  if (!booking) {
    return <NotFoundState reference={reference} />
  }

  return <BookingDetailView booking={booking} onReload={reload} />
}

/**
 * The booking itself. A booking on hold counts down, and when the countdown reaches zero the page shows the expired
 * booking and asks the server for the new status, so the customer does not have to reload the page.
 */
function BookingDetailView({ booking, onReload }: { booking: BookingDetail; onReload: () => Promise<void> }) {
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [cancelled, setCancelled] = useState<CancelBookingResult | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // The countdown reached zero: the hold is over, even if the server has not moved the booking yet.
  const [holdOver, setHoldOver] = useState(false)
  // The hold the page already reacted to, so a reload cannot start the countdown over.
  const answeredHoldRef = useRef<string | null>(null)
  // Counts the reloads that wait for the expiry sweep to move the booking.
  const [reloadTick, setReloadTick] = useState(0)

  const handleExpiry = useCallback(() => {
    if (answeredHoldRef.current === booking.holdExpiresAt) {
      return
    }
    answeredHoldRef.current = booking.holdExpiresAt
    setHoldOver(true)
    void onReload()
  }, [booking.holdExpiresAt, onReload])

  // The hold is over, but the server still says 'held': ask again until the expiry sweep has moved the booking.
  useEffect(() => {
    if (!holdOver || booking.status !== 'held') {
      return
    }
    const timer = window.setTimeout(() => {
      setReloadTick((tick) => tick + 1)
      void onReload()
    }, RELOAD_AFTER_EXPIRY_MS)
    return () => window.clearTimeout(timer)
  }, [booking.status, holdOver, onReload, reloadTick])

  const status: BookingStatus = booking.status === 'held' && holdOver ? 'expired' : booking.status
  const chip = bookingChip(booking, status)
  const ordering = orderingWindow(booking)
  const cancellable = status === 'confirmed' || status === 'held'

  function handleCancelled(result: CancelBookingResult) {
    setIsCancelOpen(false)
    setCancelled(result)
    void onReload()
  }

  /** The booking can no longer be cancelled, because its hold expired while the customer was on the page. */
  function handleInvalidState(error: ApiError) {
    setIsCancelOpen(false)
    setNotice(invalidStateNotice(error))
    void onReload()
  }

  return (
    <>
      <PageShell>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link to="/bookings">
            <ArrowLeft aria-hidden="true" />
            My Trips
          </Link>
        </Button>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-2xl font-semibold tracking-tight">Booking {booking.reference}</h1>
              <StatusChip label={chip.label} tone={chip.tone} />
            </div>
            <p className="text-muted-foreground">
              Booked {formatDateWithYear(booking.bookedAt)} · {partyLabel(booking.passengers)} ·{' '}
              {formatMoney(booking.total, booking.currency)}
            </p>
            {booking.cancelledAt ? (
              <p className="text-sm text-muted-foreground">Cancelled on {formatDateWithYear(booking.cancelledAt)}.</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {status === 'held' ? (
              <Button asChild>
                <Link to="/review-pay/$reference" params={{ reference: booking.reference }}>
                  Complete payment
                </Link>
              </Button>
            ) : null}
            {status === 'confirmed' ? <FeatureAction label="Change booking" reason={CHANGE_BOOKING_DISABLED} variant="outline" /> : null}
            <FeatureAction label="Report a problem" reason={COMPLAINT_DISABLED} variant="outline" />
            {cancellable ? (
              <Button
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setIsCancelOpen(true)}
              >
                Cancel booking
              </Button>
            ) : null}
          </div>
        </header>

        {status === 'held' ? (
          <HoldBanner
            reference={booking.reference}
            holdExpiresAt={booking.holdExpiresAt}
            serverNow={booking.serverNow}
            onExpire={handleExpiry}
          />
        ) : null}

        {status === 'expired' ? (
          <MessageCard title="This hold has expired">
            <p className="text-sm text-muted-foreground">
              {notice ?? 'This hold expired and its seats are back on sale. Nothing was charged.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/search">Search again</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/bookings">Go to My Trips</Link>
              </Button>
            </div>
          </MessageCard>
        ) : null}

        {notice && status !== 'expired' ? (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {cancelled ? (
          <Alert>
            <AlertDescription>{cancelNotice(cancelled)}</AlertDescription>
          </Alert>
        ) : null}

        <FlightsCard booking={booking} status={status} />
        {/* The seat of a held booking can still be changed, so the panel works on a hold too. */}
        {(status === 'held' || status === 'confirmed') && (
          <BookingSeatChangesPanel reference={booking.reference} onChanged={() => void onReload()} />
        )}
        {(status === 'held' || status === 'confirmed') && (
          <BookingAssistancePanel reference={booking.reference} onChanged={() => void onReload()} />
        )}

        {/* A boarding pass only exists for a confirmed booking. */}
        {status === 'confirmed' && (
          <Card>
            <CardHeader>
              <CardTitle>Check-in and boarding pass</CardTitle>
              <CardDescription>Available once check-in is complete. Scan the QR code at the gate.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <FeatureAction label="Download boarding pass" reason={CHECK_IN_DISABLED} />
                <FeatureAction label="Add to wallet" reason={CHECK_IN_DISABLED} variant="outline" />
              </div>
              <div className="size-20 rounded-md border border-dashed bg-muted" aria-hidden="true" />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <PassengersCard booking={booking} />

          {/* Feature 12 sells meals for confirmed bookings only. */}
          {status === 'confirmed' && (
            <Card>
              <CardHeader>
                <CardTitle>Meals &amp; Onboard Shop</CardTitle>
                <CardDescription>Add meals, snacks and duty-free to this booking.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FeatureAction label="Browse onboard shop" reason={MEALS_DISABLED} />
                <div className="flex flex-wrap gap-2">
                  <FeatureAction label="Pre-order meals" reason={MEALS_DISABLED} variant="outline" size="sm" />
                  <FeatureAction label="Snacks and drinks" reason={MEALS_DISABLED} variant="outline" size="sm" />
                  <FeatureAction label="Duty-free" reason={MEALS_DISABLED} variant="outline" size="sm" />
                </div>
                <p className={`text-sm ${ordering.open ? 'text-ok' : 'text-muted-foreground'}`}>{orderingLabel(ordering)}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <PaymentCard booking={booking} />

        <div className="grid gap-6 md:grid-cols-2">
          <HelpCard title="Lost or delayed baggage?" feature="F10" text="Report a lost bag or follow a bag case for this booking.">
            <FeatureAction label="Report a lost bag" reason={LOST_BAG_DISABLED} variant="link" />
          </HelpCard>
          <HelpCard title="Something went wrong?" feature="F13" text="Tell us about the flight, the food or a staff member.">
            <FeatureAction label="Report a problem" reason={COMPLAINT_DISABLED} variant="link" />
          </HelpCard>
        </div>
      </PageShell>

      {isCancelOpen ? (
        <CancelBookingDialog
          booking={booking}
          onClose={() => setIsCancelOpen(false)}
          onCancelled={handleCancelled}
          onInvalidState={handleInvalidState}
        />
      ) : null}
    </>
  )
}

/** What the cancel overlay says after the booking is cancelled. */
function cancelNotice(result: CancelBookingResult): string {
  if (result.milesReturned && result.milesReturned > 0) {
    return `Booking cancelled. ${result.milesReturned} miles have been returned.`
  }
  if (result.refund > 0) {
    return `Booking cancelled. A refund of ${formatMoney(result.refund, result.currency)} will be returned to your original payment method.`
  }
  if (result.fee > 0) {
    return `Booking cancelled. The cancellation fee of ${formatMoney(result.fee, result.currency)} covered the full fare, so no refund is due.`
  }
  return 'Booking cancelled.'
}

/**
 * What the page says when the cancel route answers 409 INVALID_BOOKING_STATE, because the booking left the state it was
 * in while the customer was on the page. The route says which state it is in.
 */
function invalidStateNotice(error: ApiError): string {
  if (statusOfError(error) === 'expired') {
    return 'This hold expired, so the booking can no longer be cancelled. Its seats are back on sale. Nothing was charged.'
  }
  return 'This booking can no longer be cancelled, because it is no longer in the state it was in. Reload the page to see its latest status.'
}

/** The status the route reports in the details of the error. */
function statusOfError(error: ApiError): string | null {
  const details = error.details
  if (typeof details !== 'object' || details === null || !('status' in details)) {
    return null
  }
  const status = (details as { status?: unknown }).status
  return typeof status === 'string' ? status : null
}

/** A link to another feature's page about this booking. */
function HelpCard({ title, feature, text, children }: { title: string; feature: string; text: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          <Badge variant="secondary" className="font-mono">
            {feature}
          </Badge>
        </CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <PageShell>
      <MessageCard title="Loading booking…" busy>
        <p className="text-sm text-muted-foreground">Checking your itinerary, your seats and your tickets.</p>
      </MessageCard>
    </PageShell>
  )
}

function NotFoundState({ reference }: { reference: string }) {
  return (
    <PageShell>
      <MessageCard title={`We couldn't find booking ${reference}`}>
        <p className="text-sm text-muted-foreground">Check the reference or go back to your trips.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/bookings">Go to My Trips</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/search">Search flights</Link>
          </Button>
        </div>
      </MessageCard>
    </PageShell>
  )
}

function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <PageShell>
      <MessageCard title="We could not load this booking">
        <ApiErrorBanner error={error} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link to="/bookings">Go to My Trips</Link>
          </Button>
        </div>
      </MessageCard>
    </PageShell>
  )
}
