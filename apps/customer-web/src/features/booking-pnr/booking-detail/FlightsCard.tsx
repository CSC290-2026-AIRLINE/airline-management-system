import { Armchair } from 'lucide-react'
import type { BookingCoupon, BookingDetail, BookingStatus } from '../api/types'
import { StatusChip } from '../components/StatusChip'
import { formatFlightDate, formatTicketNumber, formatTime } from '../lib/format'
import { couponChip } from './booking-detail-model'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'

/**
 * The flights of a booking: one row per flight, with the seats, the ticket number and the coupon (frame 08).
 */
export function FlightsCard({ booking, status = booking.status }: { booking: BookingDetail; status?: BookingStatus }) {
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
    <Card>
      <CardHeader>
        <CardTitle>Flights</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flight</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead className="hidden sm:table-cell">Ticket</TableHead>
              <TableHead className="hidden sm:table-cell">Coupon</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {booking.segments.map((segment) => {
              const coupons = couponsBySegment.get(segment.bookingSegmentId) ?? []
              const ticket = coupons[0]?.ticketNumber ?? null
              const chip = couponChip(coupons[0]?.status ?? booking.status)

              return (
                <TableRow key={segment.bookingSegmentId} className="align-top hover:bg-transparent">
                  <TableCell>
                    <p className="font-medium">
                      {segment.flightNumber} · {segment.origin} → {segment.destination}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatFlightDate(segment.depAt, segment.originTimeZone)} · {formatTime(segment.depAt, segment.originTimeZone)} →{' '}
                      {formatTime(segment.arrAt, segment.destinationTimeZone)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums sm:hidden">
                      {ticket ? formatTicketNumber(ticket) : 'Ticket not issued'}
                    </p>
                    <div className="mt-1.5 sm:hidden">
                      <StatusChip label={chip.label} tone={chip.tone} />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      {coupons.map((coupon) => {
                        const passenger = passengerById.get(coupon.bookingPassengerId)
                        const name = passenger ? passenger.firstName : 'Passenger'

                        if (infantIds.has(coupon.bookingPassengerId)) {
                          return (
                            <p className="" key={coupon.couponId}>
                              {name} · on a lap
                            </p>
                          )
                        }

                        if (!coupon.seatCode) {
                          // A seat can be chosen while the booking is on hold and after it is confirmed, as long as the
                          // coupon itself is still open.
                          const canChooseSeat =
                            (status === 'held' || status === 'confirmed') && (coupon.status === 'held' || coupon.status === 'confirmed')

                          return (
                            <p className="flex flex-wrap items-center gap-x-2" key={coupon.couponId}>
                              <span className="text-muted-foreground">{name} · Seat not chosen</span>
                              {canChooseSeat ? (
                                <a
                                  href="#seats"
                                  className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
                                  aria-label={`Choose seat for ${name}`}
                                >
                                  <Armchair aria-hidden="true" size={14} strokeWidth={2} />
                                  Choose seat
                                </a>
                              ) : null}
                            </p>
                          )
                        }

                        return (
                          <p className="" key={coupon.couponId}>
                            {name} <span className="font-medium tabular-nums">{coupon.seatCode}</span>
                          </p>
                        )
                      })}
                    </div>
                  </TableCell>

                  <TableCell className="hidden font-mono text-xs tabular-nums sm:table-cell">
                    {ticket ? formatTicketNumber(ticket) : 'Not issued'}
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    <StatusChip label={chip.label} tone={chip.tone} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
