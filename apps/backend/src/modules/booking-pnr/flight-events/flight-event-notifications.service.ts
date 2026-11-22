import { Inject, Injectable } from '@nestjs/common'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  BOOKING_READ_PORT,
  type BookingClock,
  type BookingEventBus,
  type BookingListItem,
  type BookingReadPort,
  type CancelForFlightResult,
  type FlightEvent,
} from '../contracts'

@Injectable()
export class FlightEventNotificationsService {
  constructor(
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
    @Inject(BOOKING_EVENT_BUS) private readonly events: BookingEventBus,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  // Called only after the event handler's database transaction has committed.
  async cancellation(event: FlightEvent, result: CancelForFlightResult): Promise<void> {
    const remaining = new Set(result.affectedBookingIds)
    if (!remaining.size) return
    const bookings = await this.listBookings(event.flightId)
    const affected = bookings.filter((booking) => remaining.has(booking.bookingId))
    for (const booking of affected) remaining.delete(booking.bookingId)
    if (remaining.size) throw new Error('Could not resolve all affected bookings for flight cancellation')
    const now = this.clock.now()
    for (const booking of affected) {
      await this.events.publish({
        type: event.resolution === 'rebook_partner' ? 'booking.partner_rebooked' : 'booking.cancelled',
        bookingId: booking.bookingId,
        reference: booking.reference,
        customerId: booking.customerId,
        flightIds: [event.flightId],
        occurredAt: now,
        cancelReason: event.resolution === 'rebook_partner' ? 'rebooked_partner' : 'flight_cancelled',
      })
    }
  }

  // Coupon ownership is resolved through B's read port; this service never queries booking tables directly.
  async seatsChanged(flightId: string, releasedCouponIds: string[]): Promise<void> {
    const remaining = new Set(releasedCouponIds)
    if (!remaining.size) return
    const bookings = await this.listBookings(flightId)
    const affected: Array<{ bookingId: string; reference: string; customerId: string }> = []
    // The shared read port has no batch booking-detail method; limit concurrent reads.
    for (let offset = 0; offset < bookings.length && remaining.size; offset += 10) {
      const details = await Promise.all(bookings.slice(offset, offset + 10).map((booking) => this.bookings.getBooking(booking.reference)))
      for (const booking of details) {
        if (!booking) continue
        const matching = booking.coupons.filter((coupon) => coupon.flightId === flightId && remaining.has(coupon.couponId))
        for (const coupon of matching) remaining.delete(coupon.couponId)
        if (matching.length) affected.push(booking)
      }
    }
    if (remaining.size) throw new Error('Could not resolve all affected coupons for the aircraft change')
    const now = this.clock.now()
    for (const booking of affected) {
      await this.events.publish({
        type: 'booking.seat_changed',
        bookingId: booking.bookingId,
        reference: booking.reference,
        customerId: booking.customerId,
        flightIds: [flightId],
        occurredAt: now,
      })
    }
  }

  private async listBookings(flightId: string): Promise<BookingListItem[]> {
    const result: BookingListItem[] = []
    for (let page = 1; ; page++) {
      const current = await this.bookings.listStaffBookings({ flightId, page, pageSize: 100 })
      result.push(...current.items)
      if (!current.items.length || result.length >= current.total) return result
    }
  }
}
