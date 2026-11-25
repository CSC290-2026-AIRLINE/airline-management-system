import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  PRICING_PORT,
  SEAT_MAP_PORT,
  SEAT_PORT,
  type BookingClock,
  type PricingPort,
  type SeatMapPort,
  type SeatPort,
  type SeatType,
} from '../contracts'

export interface HeldSeatChangeResult {
  status: 'assigned'
  seat: { seatCode: string; type: SeatType }
  // The new booking total: the customer pays it at checkout, so the seat fee goes into the total.
  total: number
  currency: string
}

/**
 * Changes the seat of a booking that is still on hold.
 *
 * The new seat is held until the booking's hold expires, so a seat change never extends the hold. The seat fee is
 * added to the booking total instead of being charged now: the customer has not paid yet, and checkout takes the
 * total of the hold.
 */
@Injectable()
export class HeldSeatChangeService {
  constructor(
    private readonly db: DbService,
    @Inject(SEAT_PORT) private readonly seats: SeatPort,
    @Inject(SEAT_MAP_PORT) private readonly layouts: SeatMapPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async changeSeat(reference: string, couponId: string, seatCode: string): Promise<HeldSeatChangeResult> {
    const now = this.clock.now()
    // The booking row is locked first, the same order the confirmation and cancellation paths use.
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string; hold_expires_at: Date; currency: string }>>`
        SELECT id, status, hold_expires_at, currency FROM booking WHERE booking_reference = ${reference} FOR UPDATE
      `
      const booking = rows[0]
      if (!booking) throw new BookingError('INVALID_BOOKING_STATE', 'Booking not found', 404)
      if (booking.status !== 'held')
        throw new BookingError('BOOKING_CLOSED', 'This booking is no longer on hold, so its seats can no longer be changed.', 409)
      if (booking.hold_expires_at <= now)
        throw new BookingError('BOOKING_CLOSED', 'The hold has expired, so the seat can no longer be changed.', 409)

      const coupon = await tx.booking_coupon.findFirst({
        where: { id: couponId, booking_id: booking.id, status: 'held' },
        include: {
          booking_segment: true,
          booking_passenger: { include: { other_booking_passenger: true, booking_service_request: true } },
          fare_quote: { include: { promo_code: true } },
        },
      })
      if (!coupon) throw new BookingError('INVALID_BOOKING_STATE', 'Booking or coupon not found', 404)
      if (!coupon.fare_quote) throw new BookingError('SEAT_NOT_ALLOWED', 'This passenger does not travel in a seat of their own.', 422)

      const layout = await this.layouts.getSeatMap(coupon.flight_id)
      const seat = layout.rows.flatMap((row) => row.seats).find((item) => item.seatCode === seatCode)
      if (!seat || seat.blocked) throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is not available on this aircraft', 422)
      if (seat.cabin !== coupon.booking_segment.cabin)
        throw new BookingError('SEAT_NOT_ALLOWED', 'Seat does not match the selected cabin', 422)

      // The seat the coupon holds now is released first: a coupon has one live assignment per status.
      await this.seats.releaseForCoupon(tx, coupon.id, now)

      const fee = await this.pricing.seatFee({ flightId: coupon.flight_id, cabin: seat.cabin, seatType: seat.type })
      // The new seat is held for the rest of the booking's hold, so it can never outlive the booking.
      await this.seats.holdForBooking(
        tx,
        booking.id,
        [{ bookingCouponId: coupon.id, flightId: coupon.flight_id, seatCode, fee }],
        booking.hold_expires_at,
      )

      // The seat type is part of the fare quote, so a different seat can cost more. The booking total is the sum of
      // the coupons, so re-pricing this coupon re-prices the booking.
      const quote = await this.pricing.quote({
        flightId: coupon.flight_id,
        cabin: coupon.booking_segment.cabin,
        fareClassId: coupon.fare_quote.fare_class_id,
        ...(coupon.fare_quote.promo_code ? { promoCode: coupon.fare_quote.promo_code.code } : {}),
        seatType: seat.type,
      })
      await tx.booking_coupon.update({
        where: { id: coupon.id },
        data: {
          ...(quote.fareQuoteId ? { fare_quote_id: quote.fareQuoteId } : {}),
          price_total: (Math.round(quote.pricePerPassenger * 100) / 100).toFixed(2),
          updated_at: now,
        },
      })
      const totals = await tx.booking_coupon.aggregate({ where: { booking_id: booking.id }, _sum: { price_total: true } })
      return {
        status: 'assigned',
        seat: { seatCode, type: seat.type },
        total: Number(totals._sum.price_total ?? 0),
        currency: booking.currency,
      }
    })
  }
}
