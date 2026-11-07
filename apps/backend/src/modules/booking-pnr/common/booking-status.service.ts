import { Inject, Injectable } from '@nestjs/common'
import { BookingError } from './booking-error'
import { BOOKING_CLOCK, type BookingClock, type BookingStatus, type BookingTransaction, type CouponCancelReason } from '../contracts'

const ALLOWED_MOVES: Record<BookingStatus, readonly BookingStatus[]> = {
  held: ['confirmed', 'expired'],
  confirmed: ['cancelled'],
  expired: ['confirmed'],
  cancelled: [],
}

export interface BookingStatusRow {
  id: string
  status: string
}

export interface BookingStatusMoveOptions {
  cancelReason?: CouponCancelReason
}

export function assertBookingStatusMove(from: string, to: BookingStatus): void {
  const allowed = ALLOWED_MOVES[from as BookingStatus]
  if (!allowed || !allowed.includes(to)) {
    throw new BookingError('INVALID_BOOKING_STATE', `Cannot move a booking from ${from} to ${to}.`, 409, { from, to })
  }
}

@Injectable()
export class BookingStatusService {
  constructor(@Inject(BOOKING_CLOCK) private readonly clock: BookingClock) {}

  async move(tx: BookingTransaction, booking: BookingStatusRow, to: BookingStatus, options: BookingStatusMoveOptions = {}): Promise<void> {
    assertBookingStatusMove(booking.status, to)

    if (to === 'cancelled' && !options.cancelReason) {
      throw new BookingError('BOOKING_CLOSED', 'A cancellation reason is required.', 400)
    }

    const now = this.clock.now()
    const bookingData = {
      status: to,
      updated_at: now,
      ...(to === 'confirmed' ? { confirmed_at: now } : {}),
      ...(to === 'cancelled' ? { cancelled_at: now } : {}),
    }
    const couponData = {
      status: to,
      updated_at: now,
      ...(to === 'cancelled' ? { cancelled_at: now, cancel_reason: options.cancelReason } : {}),
    }

    await tx.booking.update({ where: { id: booking.id }, data: bookingData })
    await tx.booking_coupon.updateMany({ where: { booking_id: booking.id }, data: couponData })
  }
}
