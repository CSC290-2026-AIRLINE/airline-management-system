import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { BookingDetail, InsurancePolicySummary } from '../api/types'
import { partyLabel } from '../booking-detail/booking-detail-model'
import { StatusChip } from '../components/StatusChip'
import { formatCabin, formatDateTime, formatFlightDate, formatMoney, formatTime } from '../lib/format'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { PageShell } from '../components/PageShell'

/**
 * The booking is paid and ticketed.
 *
 * The page says what was booked, not only that it was: the reference the customer reads out to the airline, the flights
 * with their seats, who is travelling and what was paid. The trips and the passengers come from the booking itself, so
 * the page is the same whether the customer confirms here or arrives on a booking that was already paid.
 */
export function ConfirmedState({
  booking,
  insurancePolicy = null,
}: {
  booking: BookingDetail
  insurancePolicy?: InsurancePolicySummary | null
}) {
  const passengersById = new Map(booking.passengers.map((passenger) => [passenger.bookingPassengerId, passenger]))
  /* The seats of every flight, so each flight row can say who sits where. */
  const seatsBySegment = new Map<string, string[]>()
  for (const coupon of booking.coupons) {
    if (!coupon.seatCode) {
      continue
    }
    const passenger = passengersById.get(coupon.bookingPassengerId)
    if (!passenger) {
      continue
    }
    const seats = seatsBySegment.get(coupon.bookingSegmentId) ?? []
    seats.push(`${coupon.seatCode} (${passenger.firstName})`)
    seatsBySegment.set(coupon.bookingSegmentId, seats)
  }

  const segments = [...booking.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)

  return (
    <PageShell className="max-w-2xl">
      <Card>
        <CardContent className="space-y-6">
          <header className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ok/10 text-ok" aria-hidden="true">
              <Check className="size-6" strokeWidth={2.5} />
            </span>
            <div className="space-y-1">
              <StatusChip label="Confirmed" tone="confirmed" />
              <h1 className="m-0 text-2xl font-semibold tracking-tight">Your booking is confirmed</h1>
              <p className="text-muted-foreground">Payment received and tickets issued.</p>
              <p className="text-xs text-muted-foreground">
                {booking.confirmedAt ? `Confirmed ${formatDateTime(booking.confirmedAt)}. ` : ''}A confirmation was sent to{' '}
                {booking.contactEmail}.
              </p>
            </div>
          </header>

          <div className="inline-flex flex-col gap-0.5 rounded-lg border bg-muted/40 px-4 py-3">
            <span className="text-xs text-muted-foreground">Booking reference</span>
            <span className="font-mono text-2xl font-semibold tracking-widest">{booking.reference}</span>
          </div>

          <section aria-labelledby="confirmed-trip" className="space-y-2">
            <h2 id="confirmed-trip" className="m-0 text-sm font-semibold">
              Your trip
            </h2>
            <div className="divide-y rounded-lg border">
              {segments.map((segment) => {
                const seats = seatsBySegment.get(segment.bookingSegmentId) ?? []
                return (
                  <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3" key={segment.bookingSegmentId}>
                    <div>
                      <p className="text-sm font-medium">
                        {segment.flightNumber} · {formatCabin(segment.cabin)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatFlightDate(segment.depAt, segment.originTimeZone)} · {segment.origin}{' '}
                        {formatTime(segment.depAt, segment.originTimeZone)} → {segment.destination}{' '}
                        {formatTime(segment.arrAt, segment.destinationTimeZone)}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {seats.length === 0 ? 'Seat not chosen' : `${seats.length === 1 ? 'Seat' : 'Seats'} ${seats.join(', ')}`}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="space-y-1 border-t pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted-foreground">{partyLabel(booking.passengers)} · tickets issued</p>
              <p className="text-sm">
                Total paid{' '}
                <strong className="text-lg tabular-nums">
                  {formatMoney(booking.total + (insurancePolicy?.price ?? 0), insurancePolicy?.currency ?? booking.currency)}
                </strong>
              </p>
            </div>
            {insurancePolicy ? (
              <p className="text-sm text-muted-foreground">
                Travel insurance policy {insurancePolicy.policyNumber} ·{' '}
                {insurancePolicy.price > 0 ? formatMoney(insurancePolicy.price, insurancePolicy.currency) : 'included with your membership'}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/bookings/$reference" params={{ reference: booking.reference }}>
                  View trip
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/bookings/$reference/shop" params={{ reference: booking.reference }}>
                  Add meals &amp; extras
                </Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional. Meals, snacks and duty-free can be ordered until 48 hours before departure.
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
