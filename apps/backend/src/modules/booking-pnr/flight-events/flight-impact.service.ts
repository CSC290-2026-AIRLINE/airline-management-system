import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BOOKING_READ_PORT, type BookingReadPort } from '../contracts'

@Injectable()
export class FlightImpactService {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_READ_PORT) private readonly bookings: BookingReadPort,
  ) {}

  async flightImpactSummary(flightId: string) {
    const flight = await this.db.flight.findUnique({ where: { id: flightId }, select: { id: true } })
    if (!flight) throw new NotFoundException('Flight not found')
    const [counts, inventory] = await Promise.all([
      this.bookings.countBookingsForFlight(flightId),
      this.db.seat_inventory.findMany({
        where: { flight_id: flightId },
        select: { cabin: true, capacity: true, held_count: true, sold_count: true },
        orderBy: { cabin: 'asc' },
      }),
    ])
    return {
      flightId,
      ...counts,
      cabins: inventory.map((row) => ({
        cabin: row.cabin,
        capacity: row.capacity,
        held: row.held_count,
        sold: row.sold_count,
        overCapacity: row.held_count + row.sold_count > row.capacity,
      })),
    }
  }
}
