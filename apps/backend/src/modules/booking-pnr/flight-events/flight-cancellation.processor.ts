import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  BOOKING_CLOCK,
  CANCEL_FOR_FLIGHT_PORT,
  type BookingClock,
  type BookingTransaction,
  type CancelForFlightPort,
  type FlightEvent,
} from '../contracts'

@Injectable()
export class FlightCancellationProcessor {
  constructor(
    @Inject(CANCEL_FOR_FLIGHT_PORT) private readonly cancellation: CancelForFlightPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  // The caller owns the transaction and publishes notifications only after commit.
  async process(tx: BookingTransaction, event: FlightEvent) {
    if (event.type !== 'flight.cancelled') throw new BadRequestException('Expected a flight.cancelled event')
    // The receipt may not exist yet. Lock the event first so simultaneous deliveries cannot both apply the policy.
    const events = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM flight_event WHERE id = ${event.id}::uuid FOR UPDATE`
    if (!events.length) throw new NotFoundException('Flight event not found')
    const receipt = await tx.flight_event_receipt.findUnique({ where: { event_id: event.id }, select: { event_id: true } })
    if (receipt) return null

    const result = await this.cancellation.cancelBookingsForFlight(tx, event.flightId, event)
    const expiredBookings = await tx.booking.findMany({
      where: { id: { in: result.affectedBookingIds }, status: 'expired' },
      select: { id: true },
    })
    const now = this.clock.now()
    await tx.seat_assignment.updateMany({
      where: {
        status: { in: ['held', 'assigned'] },
        OR: [
          { booking_coupon_id: { in: result.cancelledCouponIds } },
          { booking_coupon: { booking_id: { in: expiredBookings.map((booking) => booking.id) } } },
        ],
      },
      data: { status: 'released', released_at: now, updated_at: now },
    })
    await tx.flight_event_receipt.create({ data: { event_id: event.id, processed_at: now } })
    return result
  }
}
