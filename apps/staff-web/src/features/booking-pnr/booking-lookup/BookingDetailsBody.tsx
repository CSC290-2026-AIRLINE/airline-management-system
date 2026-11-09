import type { BookingDetail } from '../api/types'
import { lookupDate, lookupMoney, ticketLabel } from './lookup-utils'

export function BookingDetailsBody({ booking }: { booking: BookingDetail }) {
  const open = booking.serviceRequests.filter((request) => request.status === 'requested' || request.status === 'accepted')
  return (
    <>
      <p className="f3-lookup-muted">
        Booked by {booking.bookedByStaffId ? 'a staff agent' : 'the customer'} · {lookupDate(booking.bookedAt, true)} UTC
      </p>
      {open.length > 0 && (
        <div className="f3-lookup-warning" role="status">
          {open.length} open assistance request{open.length === 1 ? '' : 's'}. Check the assistance queue for the latest decisions.
        </div>
      )}
      <div className="f3-lookup-detail-columns">
        <section>
          <h3>Flights</h3>
          {booking.segments.map((segment) => (
            <article className="f3-lookup-detail-item" key={segment.bookingSegmentId}>
              <strong>
                {segment.origin} → {segment.destination}
              </strong>
              <p>
                {segment.flightNumber} · {segment.cabin.replace('_', ' ')}
                {segment.fareClassCode ? ` · ${segment.fareClassCode}` : ''}
              </p>
              <p>
                {lookupDate(segment.depAt, true)} → {lookupDate(segment.arrAt, true)} UTC
              </p>
            </article>
          ))}
        </section>
        <section>
          <h3>Passengers & tickets</h3>
          {booking.passengers.map((person) => (
            <article className="f3-lookup-detail-item" key={person.bookingPassengerId}>
              <strong>
                {person.firstName} {person.lastName}
              </strong>
              <p>{person.passengerType}</p>
              {booking.coupons
                .filter((coupon) => coupon.bookingPassengerId === person.bookingPassengerId)
                .map((coupon) => (
                  <div key={coupon.couponId}>
                    <p>
                      {booking.segments.find((segment) => segment.bookingSegmentId === coupon.bookingSegmentId)?.flightNumber} ·{' '}
                      {coupon.seatCode ?? 'Seat not chosen'}
                    </p>
                    <p>
                      Ticket: {ticketLabel(coupon.ticketNumber)} · {coupon.status}
                    </p>
                  </div>
                ))}
            </article>
          ))}
        </section>
      </div>
      <section className="f3-lookup-contact">
        <h3>Booking contact</h3>
        <p>{booking.contactEmail}</p>
        <p>{booking.contactPhone ?? 'No phone provided'}</p>
        <strong>Total {lookupMoney(booking.total, booking.currency)}</strong>
      </section>
      {booking.serviceRequests.length > 0 && (
        <section>
          <h3>Assistance</h3>
          <ul>
            {booking.serviceRequests.map((request) => (
              <li key={request.serviceRequestId}>
                {request.serviceCode} · {request.status === 'requested' ? 'Pending' : request.status}
                {request.note ? ` · ${request.note}` : ''}
                {request.decisionNote ? ` · ${request.decisionNote}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>History</h3>
        {booking.history.length ? (
          <ol className="f3-lookup-history">
            {booking.history.map((entry, index) => (
              <li key={`${entry.at}/${index}`}>
                <span>{lookupDate(entry.at, true)} UTC</span>
                <strong>
                  {entry.event === 'held'
                    ? 'Booking held'
                    : entry.event === 'confirmed'
                      ? 'Payment confirmed, tickets issued'
                      : entry.event === 'cancelled'
                        ? 'Booking cancelled'
                        : 'Booking expired'}
                </strong>
                {entry.byStaffId && <small>Staff action</small>}
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
