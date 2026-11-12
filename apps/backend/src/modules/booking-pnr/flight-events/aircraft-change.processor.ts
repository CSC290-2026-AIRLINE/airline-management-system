import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  INVENTORY_PORT,
  SEAT_MAP_PORT,
  type BookingClock,
  type BookingTransaction,
  type FlightEvent,
  type InventoryPort,
  type SeatMapPort,
} from '../contracts'

@Injectable()
export class AircraftChangeProcessor {
  constructor(
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(SEAT_MAP_PORT) private readonly seatMaps: SeatMapPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  // The event handler owns the receipt and publishes seat-change notifications after this transaction commits.
  async process(tx: BookingTransaction, event: FlightEvent): Promise<{ releasedCouponIds: string[] }> {
    if (event.type !== 'flight.aircraft_changed' || !event.oldAircraftId || !event.newAircraftId) {
      throw new BookingError('INVALID_BOOKING_STATE', 'Aircraft change event is missing aircraft information', 422)
    }
    const aircraft = await tx.aircraft.findMany({
      where: { id: { in: [event.oldAircraftId, event.newAircraftId] } },
      select: { id: true, aircraft_type_id: true },
    })
    const before = aircraft.find((item) => item.id === event.oldAircraftId)
    const after = aircraft.find((item) => item.id === event.newAircraftId)
    if (!before || !after) throw new NotFoundException('Aircraft for the change was not found')
    if (before.aircraft_type_id === after.aircraft_type_id) return { releasedCouponIds: [] }

    const [map, current, assignments] = await Promise.all([
      this.seatMaps.getSeatMap(event.flightId),
      tx.seat_inventory.findMany({ where: { flight_id: event.flightId }, select: { cabin: true } }),
      tx.seat_assignment.findMany({
        where: { flight_id: event.flightId, status: { in: ['held', 'assigned'] } },
        select: {
          id: true,
          seat_code: true,
          booking_coupon_id: true,
          booking_coupon: { select: { booking_segment: { select: { cabin: true } } } },
        },
      }),
    ])
    const capacities = new Map<string, number>(map.cabins.map((cabin) => [cabin.cabin, cabin.capacity]))
    const existing = new Set(current.map((row) => row.cabin))
    const added = map.cabins.filter((cabin) => !existing.has(cabin.cabin))
    if (added.length) await this.inventory.createForFlight(event.flightId, added, tx)
    for (const cabin of [...existing].sort()) await this.inventory.setCapacity(tx, event.flightId, cabin, capacities.get(cabin) ?? 0)

    const usable = new Map(
      map.rows
        .flatMap((row) => row.seats)
        .filter((seat) => !seat.blocked)
        .map((seat) => [seat.seatCode, seat.cabin]),
    )
    const invalid = assignments.filter((assignment) => usable.get(assignment.seat_code) !== assignment.booking_coupon.booking_segment.cabin)
    if (invalid.length) {
      const now = this.clock.now()
      await tx.seat_assignment.updateMany({
        where: { id: { in: invalid.map((item) => item.id) }, status: { in: ['held', 'assigned'] } },
        data: { status: 'released', released_at: now, updated_at: now },
      })
    }
    return { releasedCouponIds: [...new Set(invalid.map((item) => item.booking_coupon_id))] }
  }
}
