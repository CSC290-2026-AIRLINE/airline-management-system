import type { BookingCoupon, BookingDetail } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import { formatFlightDate, formatTicketNumber, formatTime } from '../lib/format'
import controls from '../styles/controls.module.css'
import { FeatureAction } from './FeatureAction'
import { couponChip, SEAT_PICKER_DISABLED } from './booking-detail-model'
import styles from './FlightsCard.module.css'

/**
 * The flights of a booking: one row per flight, with the seats, the ticket number and the coupon (frame 08).
 */
export function FlightsCard({ booking }: { booking: BookingDetail }) {
  const passengerById = new Map(booking.passengers.map((passenger) => [passenger.bookingPassengerId, passenger]))
  const couponsBySegment = new Map<string, BookingCoupon[]>()
  const infantIds = new Set(
    booking.passengers.filter((passenger) => passenger.passengerType === 'infant').map((passenger) => passenger.bookingPassengerId),
  )

  for (const coupon of booking.coupons) {
    const coupons = couponsBySegment.get(coupon.bookingSegmentId) ?? []
    coupons.push(coupon)
    couponsBySegment.set(coupon.bookingSegmentId, coupons)
  }

  return (
    <section className={styles.card}>
      <h2>Flights</h2>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Flight</th>
              <th scope="col">Seats</th>
              <th scope="col">Ticket</th>
              <th scope="col">Coupon</th>
            </tr>
          </thead>
          <tbody>
            {booking.segments.map((segment) => {
              const coupons = couponsBySegment.get(segment.bookingSegmentId) ?? []
              const ticket = coupons[0]?.ticketNumber ?? null
              const chip = couponChip(coupons[0]?.status ?? booking.status)

              return (
                <tr key={segment.bookingSegmentId}>
                  <td>
                    <p className={styles.flightTitle}>
                      {segment.flightNumber} · {segment.origin} → {segment.destination}
                    </p>
                    <p className={styles.flightMeta}>
                      {formatFlightDate(segment.depAt)} · {formatTime(segment.depAt)} → {formatTime(segment.arrAt)}
                    </p>
                  </td>

                  <td>
                    <div className={styles.seats}>
                      {coupons.map((coupon) => {
                        const passenger = passengerById.get(coupon.bookingPassengerId)
                        const name = passenger ? passenger.firstName : 'Passenger'

                        if (infantIds.has(coupon.bookingPassengerId)) {
                          return (
                            <p className={styles.seat} key={coupon.couponId}>
                              {name} · on a lap
                            </p>
                          )
                        }

                        if (!coupon.seatCode) {
                          return (
                            <p className={styles.seat} key={coupon.couponId}>
                              {name} · Seat not chosen{' '}
                              <FeatureAction label="Choose seat" reason={SEAT_PICKER_DISABLED} className={controls.link} />
                            </p>
                          )
                        }

                        return (
                          <p className={styles.seat} key={coupon.couponId}>
                            {name} {coupon.seatCode}
                          </p>
                        )
                      })}
                    </div>
                  </td>

                  <td>
                    <p className={styles.ticket}>{ticket ? formatTicketNumber(ticket) : 'Not issued'}</p>
                  </td>

                  <td>
                    <StatusChip label={chip.label} tone={chip.tone} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
