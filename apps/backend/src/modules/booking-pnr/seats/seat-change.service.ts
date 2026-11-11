import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_READ_PORT, type BookingReadPort, type BookingViewer } from '../contracts'
import { CheckinSeatProvider } from '../providers/checkin-seat.provider'

@Injectable()
export class SeatChangeService {
  constructor(
    private readonly db: DbService,
    private readonly seats: CheckinSeatProvider,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}

  async changeSeatForUser(reference: string, couponId: string, seatCode: string, userId: string) {
    const [customer, staff] = await Promise.all([
      this.db.customer.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
      // Temporary: use the same active-staff check as the assistance queue until the shared guard is available.
      this.db.staff.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
    ])
    if (staff) return this.changeSeat(reference, couponId, seatCode, { staff: true })
    if (customer) return this.changeSeat(reference, couponId, seatCode, { customerId: customer.id })
    throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
  }

  // A route must derive the viewer from authenticated server-side identity; never accept it from a request body.
  async changeSeat(reference: string, couponId: string, seatCode: string, viewer: BookingViewer) {
    if ((!viewer.customerId && viewer.staff !== true) || (viewer.customerId && viewer.staff))
      throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    const booking = await this.bookings.getBookingDetail(reference, viewer)
    const coupon = booking?.coupons.find((item) => item.couponId === couponId && item.status === 'confirmed')
    if (!booking || booking.status !== 'confirmed' || !coupon)
      throw new BookingError('INVALID_BOOKING_STATE', 'Booking or coupon not found', 404)

    const checkIn = await this.db.check_in.findFirst({
      where: {
        booking_passenger_id: coupon.bookingPassengerId,
        flight_id: coupon.flightId,
        status: { in: ['checked_in', 'boarded', 'no_show'] },
      },
      select: { id: true },
    })
    if (checkIn) throw new BookingError('BOOKING_CLOSED', 'Seat changes after check-in are handled by check-in')
    let lock: Awaited<ReturnType<CheckinSeatProvider['hold']>>
    try {
      lock = await this.seats.hold(coupon.flightId, seatCode, coupon.bookingPassengerId, 300_000, { rejectCheckedIn: true })
    } catch (error) {
      if (error instanceof NotFoundException) throw new BookingError('INVALID_BOOKING_STATE', 'Booking or coupon not found', 404)
      throw error
    }
    if (lock.fee > 0) return { status: 'payment_required' as const, lock }

    try {
      const seat = await this.seats.confirm(lock.id, { rejectCheckedIn: true })
      return { status: 'assigned' as const, seat }
    } catch (error) {
      await this.seats.release(lock.id)
      throw error
    }
  }
}
