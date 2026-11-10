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

  async changeSeatForCustomer(reference: string, couponId: string, seatCode: string, userId: string) {
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!customer) throw new NotFoundException('Booking not found')
    return this.changeSeat(reference, couponId, seatCode, { customerId: customer.id })
  }

  // A route must derive the viewer from authenticated server-side identity; never accept it from a request body.
  async changeSeat(reference: string, couponId: string, seatCode: string, viewer: BookingViewer) {
    if ((!viewer.customerId && viewer.staff !== true) || (viewer.customerId && viewer.staff))
      throw new NotFoundException('Booking not found')
    const booking = await this.bookings.getBookingDetail(reference, viewer)
    const coupon = booking?.coupons.find((item) => item.couponId === couponId && item.status === 'confirmed')
    if (!booking || booking.status !== 'confirmed' || !coupon) throw new NotFoundException('Booking or coupon not found')

    const checkIn = await this.db.check_in.findFirst({
      where: {
        booking_passenger_id: coupon.bookingPassengerId,
        flight_id: coupon.flightId,
        status: { in: ['checked_in', 'boarded', 'no_show'] },
      },
      select: { id: true },
    })
    if (checkIn) throw new BookingError('BOOKING_CLOSED', 'Seat changes after check-in are handled by check-in')
    const lock = await this.seats.hold(coupon.flightId, seatCode, coupon.bookingPassengerId, 300_000, { rejectCheckedIn: true })
    if (lock.fee > 0) return { status: 'payment_required' as const, lock }

    try {
      const seat = await this.seats.confirm(lock.id)
      return { status: 'assigned' as const, seat }
    } catch (error) {
      await this.seats.release(lock.id)
      throw error
    }
  }
}
