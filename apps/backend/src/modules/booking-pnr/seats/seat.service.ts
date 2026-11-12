import { Inject, Injectable } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import { SEAT_MAP_PORT, type BookingTransaction, type HoldSeatInput, type SeatMapPort, type SeatPort } from '../contracts'

@Injectable()
export class SeatService implements SeatPort {
  constructor(@Inject(SEAT_MAP_PORT) private readonly layouts: SeatMapPort) {}

  async holdForBooking(tx: BookingTransaction, bookingId: string, seats: HoldSeatInput[], expiresAt: Date): Promise<void> {
    const layouts = new Map<string, Awaited<ReturnType<SeatMapPort['getSeatMap']>>>()
    for (const choice of seats) {
      if (!/^[1-9][0-9]?[A-Z]$/.test(choice.seatCode)) throw new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat code')
      const coupon = await tx.booking_coupon.findFirst({
        where: { id: choice.bookingCouponId, booking_id: bookingId, flight_id: choice.flightId, status: 'held' },
        include: {
          booking_segment: true,
          booking_passenger: { include: { other_booking_passenger: true, booking_service_request: true } },
        },
      })
      if (!coupon) throw new BookingError('SEAT_NOT_ALLOWED', 'Seat does not match an active booking coupon')
      let layout = layouts.get(choice.flightId)
      if (!layout) {
        layout = await this.layouts.getSeatMap(choice.flightId)
        layouts.set(choice.flightId, layout)
      }
      const seat = layout.rows.flatMap((row) => row.seats).find((item) => item.seatCode === choice.seatCode)
      const passenger = coupon.booking_passenger
      if (!seat || seat.blocked || seat.cabin !== coupon.booking_segment.cabin || passenger.passenger_type === 'infant') {
        throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is not allowed for this passenger')
      }
      if (
        seat.type === 'exit' &&
        (passenger.passenger_type !== 'adult' ||
          passenger.other_booking_passenger ||
          passenger.booking_service_request.some(
            (request) =>
              ['requested', 'accepted'].includes(request.status) &&
              (!request.booking_segment_id || request.booking_segment_id === coupon.booking_segment_id),
          ))
      ) {
        throw new BookingError('SEAT_NOT_ALLOWED', 'Passenger is not eligible for an exit-row seat')
      }
      try {
        await tx.seat_assignment.create({
          data: {
            booking_coupon_id: coupon.id,
            flight_id: choice.flightId,
            seat_code: choice.seatCode,
            status: 'held',
            hold_expires_at: expiresAt,
          },
        })
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
          throw new BookingError('SEAT_UNAVAILABLE', 'The seat is no longer available')
        }
        throw error
      }
    }
  }

  async assignHeldForBooking(tx: BookingTransaction, bookingId: string, assignedAt: Date): Promise<void> {
    await tx.seat_assignment.updateMany({
      where: { status: 'held', booking_coupon: { booking_id: bookingId } },
      data: { status: 'assigned', assigned_at: assignedAt, hold_expires_at: null, updated_at: assignedAt },
    })
  }

  async releaseForBooking(tx: BookingTransaction, bookingId: string, releasedAt: Date): Promise<void> {
    await tx.seat_assignment.updateMany({
      where: { status: { in: ['held', 'assigned'] }, booking_coupon: { booking_id: bookingId } },
      data: { status: 'released', released_at: releasedAt, updated_at: releasedAt },
    })
  }
}
