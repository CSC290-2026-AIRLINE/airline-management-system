import type { BookingDetail } from '../api/types'
import { Accessibility } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { lookupDate, lookupDayDate, lookupMoney, lookupTime, ticketLabel } from './lookup-utils'

/**
 * The amber banner of the details dialog: one sentence per open assistance request, naming the passenger, the service
 * code and how far away the departure is (frame 01o). The departure comes from the segment the request is for, so the
 * sentence is about the flight the passenger is actually travelling on.
 */
function assistanceNote(booking: BookingDetail, request: BookingDetail['serviceRequests'][number]): string {
  const passenger = booking.passengers.find((person) => person.bookingPassengerId === request.bookingPassengerId)
  const segment = booking.segments.find((candidate) => candidate.bookingSegmentId === request.bookingSegmentId) ?? booking.segments[0]
  const name = passenger ? passenger.firstName : 'The passenger'
  if (!segment) return `${name} has a ${request.serviceCode} request awaiting review.`
  const hours = (new Date(segment.depAt).getTime() - new Date(booking.serverNow).getTime()) / 3600000
  const departure = hours > 24 ? 'Departure is more than 24 hours away.' : 'Departure is within 24 hours.'
  const state =
    request.status === 'requested' ? `a ${request.serviceCode} request awaiting review.` : `an accepted ${request.serviceCode} request.`
  return `${name} has ${state} ${departure}`
}

export function BookingDetailsBody({ booking }: { booking: BookingDetail }) {
  const open = booking.serviceRequests.filter((request) => request.status === 'requested' || request.status === 'accepted')
  return (
    <>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 [&_h3]:mb-2 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-muted-foreground [&_section]:min-w-0">
        <section>
          <h3>Flights</h3>
          {booking.segments.map((segment) => (
            <article
              className="border-b py-2 last:border-b-0 [&_p]:mt-0.5 [&_p]:text-xs [&_p]:text-muted-foreground [&_strong]:font-medium"
              key={segment.bookingSegmentId}
            >
              <strong>
                {segment.flightNumber} · {lookupDayDate(segment.depAt, segment.originTimeZone)}
              </strong>
              <p>
                {segment.origin} {lookupTime(segment.depAt, segment.originTimeZone)} → {segment.destination}{' '}
                {lookupTime(segment.arrAt, segment.destinationTimeZone)} · {segment.cabin.replace('_', ' ')}
              </p>
            </article>
          ))}
        </section>
        <section>
          <h3>Passengers</h3>
          {booking.passengers.map((person) => {
            const seat = booking.coupons.find(
              (coupon) =>
                coupon.bookingPassengerId === person.bookingPassengerId &&
                coupon.bookingSegmentId === booking.segments[0]?.bookingSegmentId,
            )?.seatCode
            return (
              <article
                className="border-b py-2 last:border-b-0 [&_p]:mt-0.5 [&_p]:text-xs [&_p]:text-muted-foreground [&_strong]:font-medium"
                key={person.bookingPassengerId}
              >
                <strong>
                  {person.firstName} {person.lastName} ({person.passengerType}){seat ? ` · ${seat}` : ''}
                </strong>
              </article>
            )
          })}
        </section>
        <section>
          <h3>Ticket numbers</h3>
          {booking.coupons.map((coupon) => (
            <p className="py-0.5 font-mono text-sm tabular-nums" key={coupon.couponId}>
              {ticketLabel(coupon.ticketNumber)}
            </p>
          ))}
        </section>
        <section>
          <h3>Total</h3>
          <div className="border-b py-2 last:border-b-0 [&_p]:mt-0.5 [&_p]:text-xs [&_p]:text-muted-foreground [&_strong]:font-medium">
            <strong>{lookupMoney(booking.total, booking.currency)}</strong>
            <p>Booked {lookupDate(booking.bookedAt)}</p>
          </div>
        </section>
      </div>
      {open.length > 0 && (
        <Alert role="status">
          <Accessibility />
          <AlertDescription className="space-y-1">
            {open.map((request) => (
              <p key={request.serviceRequestId}>{assistanceNote(booking, request)}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
      <section>
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">History</h3>
        {booking.history.length ? (
          <ol className="list-none space-y-1 p-0 text-sm [&_small]:text-xs [&_small]:text-muted-foreground [&_span]:text-xs [&_span]:text-muted-foreground">
            {booking.history.map((entry, index) => (
              <li key={`${entry.at}/${index}`}>
                {lookupDate(entry.at)} ·{' '}
                {entry.event === 'held'
                  ? 'Booking held'
                  : entry.event === 'confirmed'
                    ? 'Payment confirmed, tickets issued'
                    : entry.event === 'cancelled'
                      ? 'Booking cancelled'
                      : 'Booking expired'}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground">No booking history is available.</p>
        )}
      </section>
    </>
  )
}
