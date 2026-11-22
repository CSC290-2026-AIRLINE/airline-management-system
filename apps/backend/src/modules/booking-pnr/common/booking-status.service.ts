import { Inject, Injectable } from '@nestjs/common'
import { BookingError } from './booking-error'
import { BOOKING_CLOCK, type BookingClock, type BookingStatus, type BookingTransaction, type CouponCancelReason } from '../contracts'

const ALLOWED_MOVES: Record<BookingStatus, readonly BookingStatus[]> = {
  held: ['confirmed', 'expired'],
  confirmed: ['cancelled'],
  // Only a late payment that finds the seats still free (B3).
  expired: ['confirmed'],
  cancelled: [],
}

export interface BookingStatusRow {
  id: string
  status: string
}

export interface BookingStatusMoveOptions {
  // Required when moving to cancelled.
  cancelReason?: CouponCancelReason
  // Required when moving to confirmed. The database requires a ticket on every confirmed coupon in the same update,
  // so move() asks for one ticket per coupon (B1 passes `() => nextTicketNumber(tx, airlineNumber)`).
  issueTicket?: (couponId: string) => Promise<string>
}

export function assertBookingStatusMove(from: string, to: BookingStatus): void {
  const allowed = ALLOWED_MOVES[from as BookingStatus]
  if (!allowed || !allowed.includes(to)) {
    throw new BookingError('INVALID_BOOKING_STATE', `Cannot move a booking from ${from} to ${to}.`, 409, { from, to })
  }
}

/**
 * The one place that changes a booking's status (work split §2). It moves the booking and only the coupons that are
 * still in the booking's current status, so coupons that a flight cancellation already cancelled keep their reason.
 * Business timestamps come from the simulation clock; updated_at is real time.
 */
@Injectable()
export class BookingStatusService {
  constructor(@Inject(BOOKING_CLOCK) private readonly clock: BookingClock) {}

  async move(tx: BookingTransaction, booking: BookingStatusRow, to: BookingStatus, options: BookingStatusMoveOptions = {}): Promise<void> {
    assertBookingStatusMove(booking.status, to)

    if (to === 'cancelled' && !options.cancelReason) {
      throw new Error('A cancellation reason is required to cancel a booking.')
    }
    if (to === 'confirmed' && !options.issueTicket) {
      throw new Error('issueTicket is required to confirm a booking.')
    }

    const now = this.clock.now()
    const updatedAt = new Date()
    const bookingData = {
      status: to,
      updated_at: updatedAt,
      ...(to === 'confirmed' ? { confirmed_at: now } : {}),
      ...(to === 'cancelled' ? { cancelled_at: now } : {}),
    }
    const couponData = {
      status: to,
      updated_at: updatedAt,
      ...(to === 'cancelled' ? { cancelled_at: now, cancel_reason: options.cancelReason } : {}),
    }
    const couponsInStatus = { booking_id: booking.id, status: booking.status }

    await tx.booking.update({ where: { id: booking.id }, data: bookingData })

    if (to === 'confirmed' && options.issueTicket) {
      const coupons = await tx.booking_coupon.findMany({ where: couponsInStatus, select: { id: true } })
      for (const coupon of coupons) {
        const ticketNumber = await options.issueTicket(coupon.id)
        await tx.booking_coupon.update({ where: { id: coupon.id }, data: { ...couponData, ticket_number: ticketNumber } })
      }
      return
    }

    await tx.booking_coupon.updateMany({ where: couponsInStatus, data: couponData })
  }
}
