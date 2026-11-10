import type { BookingDetail } from '../api/types'
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
      <div className="f3-lookup-detail-grid">
        <section>
          <h3>Flights</h3>
          {booking.segments.map((segment) => (
            <article className="f3-lookup-detail-item" key={segment.bookingSegmentId}>
              <strong>
                {segment.flightNumber} · {lookupDayDate(segment.depAt)}
              </strong>
              <p>
                {segment.origin} {lookupTime(segment.depAt)} → {segment.destination} {lookupTime(segment.arrAt)} ·{' '}
                {segment.cabin.replace('_', ' ')}
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
              <article className="f3-lookup-detail-item" key={person.bookingPassengerId}>
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
            <p className="f3-lookup-ticket" key={coupon.couponId}>
              {ticketLabel(coupon.ticketNumber)}
            </p>
          ))}
        </section>
        <section>
          <h3>Total</h3>
          <div className="f3-lookup-detail-item">
            <strong>{lookupMoney(booking.total, booking.currency)}</strong>
            <p>Booked {lookupDate(booking.bookedAt)}</p>
          </div>
        </section>
      </div>
      {open.length > 0 && (
        <div className="f3-lookup-warning" role="status">
          {open.map((request) => (
            <p key={request.serviceRequestId}>{assistanceNote(booking, request)}</p>
          ))}
        </div>
      )}
      <section>
        <h3>History</h3>
        {booking.history.length ? (
          <ol className="f3-lookup-history">
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
          <p className="f3-lookup-muted">No booking history is available.</p>
        )}
      </section>
    </>
  )
}
