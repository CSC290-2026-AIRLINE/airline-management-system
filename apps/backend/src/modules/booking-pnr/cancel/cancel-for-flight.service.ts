import { Inject, Injectable } from '@nestjs/common'
import { BookingStatusService } from '../common/booking-status.service'
import { AIRLINE_TICKET_NUMBER, nextTicketNumber } from '../common/ticket-number'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type BookingTransaction,
  type CancelForFlightPort,
  type CancelForFlightResult,
  type CouponCancelReason,
  type FlightEvent,
} from '../contracts'

const ACTIVE_COUPON_STATUSES = ['held', 'confirmed'] as const

interface LockedBooking {
  id: string
  status: string
}

// B14: applies a flight cancellation's booking and coupon policy inside C7's transaction. It never touches inventory,
// seats, refunds or the event bus; C7 releases the seats, records the receipt and publishes after commit.
@Injectable()
export class CancelForFlightService implements CancelForFlightPort {
  constructor(
    private readonly statusService: BookingStatusService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async cancelBookingsForFlight(tx: BookingTransaction, flightId: string, event: FlightEvent): Promise<CancelForFlightResult> {
    const reason: CouponCancelReason = event.resolution === 'rebook_partner' ? 'rebooked_partner' : 'flight_cancelled'
    const partnerAirline = reason === 'rebooked_partner' ? event.partnerAirline : null
    if (reason === 'rebooked_partner' && !partnerAirline) {
      throw new Error(`Flight cancellation event ${event.id} is missing its partner airline.`)
    }

    const lockedBookings = await tx.$queryRaw<LockedBooking[]>`
      SELECT b.id, b.status FROM booking b
      WHERE b.id IN (
        SELECT c.booking_id FROM booking_coupon c
        WHERE c.flight_id = ${flightId} AND c.status IN ('held', 'confirmed')
      )
      ORDER BY b.id
      FOR UPDATE`

    if (lockedBookings.length === 0) {
      return this.result(event, [], [])
    }

    const coupons = await tx.booking_coupon.findMany({
      where: {
        flight_id: flightId,
        booking_id: { in: lockedBookings.map((booking) => booking.id) },
        status: { in: [...ACTIVE_COUPON_STATUSES] },
      },
      select: { id: true, booking_id: true, status: true },
      orderBy: { id: 'asc' },
    })

    if (coupons.length === 0) {
      return this.result(event, [], [])
    }

    const now = this.clock.now()
    const updatedAt = new Date()
    const cancelledCouponIds: string[] = []

    for (const coupon of coupons) {
      // A cancelled coupon always carries a ticket (database check), so a held coupon gets one when the airline cancels.
      const ticketNumber = coupon.status === 'held' ? await nextTicketNumber(tx, AIRLINE_TICKET_NUMBER) : undefined
      await tx.booking_coupon.update({
        where: { id: coupon.id },
        data: {
          status: 'cancelled',
          cancel_reason: reason,
          partner_airline: partnerAirline,
          cancelled_at: now,
          updated_at: updatedAt,
          ...(ticketNumber ? { ticket_number: ticketNumber } : {}),
        },
      })
      cancelledCouponIds.push(coupon.id)
    }

    const affectedCoupons = new Set(coupons.map((coupon) => coupon.booking_id))
    const affectedBookingIds = lockedBookings.map((booking) => booking.id).filter((id) => affectedCoupons.has(id))

    for (const booking of lockedBookings) {
      if (!affectedCoupons.has(booking.id)) {
        continue
      }
      if (booking.status === 'held') {
        // A hold that loses a segment expires whole, including its coupons on other flights.
        await this.statusService.move(tx, booking, 'expired')
        continue
      }
      if (booking.status === 'confirmed') {
        const remaining = await tx.booking_coupon.count({
          where: { booking_id: booking.id, status: { not: 'cancelled' } },
        })
        if (remaining === 0) {
          await this.statusService.move(tx, booking, 'cancelled', { cancelReason: reason })
        }
      }
    }

    return this.result(event, affectedBookingIds, cancelledCouponIds)
  }

  private result(event: FlightEvent, affectedBookingIds: string[], cancelledCouponIds: string[]): CancelForFlightResult {
    return { eventId: event.id, affectedBookingIds, cancelledCouponIds }
  }
}
