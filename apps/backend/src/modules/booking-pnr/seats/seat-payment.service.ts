import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_READ_PORT, type BookingReadPort } from '../contracts'
import { CheckinSeatProvider } from '../providers/checkin-seat.provider'

@Injectable()
export class SeatPaymentService {
  constructor(
    private readonly db: DbService,
    private readonly seats: CheckinSeatProvider,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}
  async confirmForUser(reference: string, couponId: string, lockId: string, userId: string, overrideReason?: string) {
    const [customer, staff] = await Promise.all([
      this.db.customer.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
      this.db.staff.findFirst({
        where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
        select: { id: true },
      }),
    ])
    if (!staff && !customer) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
    if (overrideReason !== undefined && (!staff || !overrideReason.trim() || overrideReason.trim().length > 500))
      throw new BookingError(
        'SEAT_NOT_ALLOWED',
        'A staff seat assignment requires an active staff account and a reason of 1 to 500 characters',
        staff ? 422 : 403,
      )
    const booking = await this.bookings.getBookingDetail(reference, staff ? { staff: true } : { customerId: customer!.id })
    if (booking?.status !== 'confirmed' || !booking.coupons.some((coupon) => coupon.couponId === couponId && coupon.status === 'confirmed'))
      throw new BookingError('INVALID_BOOKING_STATE', 'Booking coupon not found', 404)
    const lock = await this.db.seat_assignment.findFirst({
      where: { id: lockId, booking_coupon_id: couponId, status: { in: ['held', 'assigned'] } },
      select: { id: true },
    })
    if (!lock) throw new BookingError('SEAT_UNAVAILABLE', 'Seat hold not found')
    const seat = await this.seats.confirm(lock.id, {
      rejectCheckedIn: true,
      payWithCheckout: true,
      ...(staff && overrideReason !== undefined ? { staffOverride: { userId, staffId: staff.id, reason: overrideReason.trim() } } : {}),
    })
    return { status: 'assigned' as const, seat }
  }
}
