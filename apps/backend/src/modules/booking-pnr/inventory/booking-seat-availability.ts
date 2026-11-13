import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SeatAvailability } from '@backend/modules/pricing/fare-quote/seat-availability'
import { cashSeats } from './inventory.math'

// Feature 3b's answer for Feature 4: how much of a cabin is still free for a cash buyer, as a percentage of the
// cabin's capacity. A cabin with no inventory row is a cabin that cannot be sold.
@Injectable()
export class BookingSeatAvailability extends SeatAvailability {
  constructor(private readonly db: DbService) {
    super()
  }

  async seatsLeftPct(flightId: string, cabin: string): Promise<number> {
    const row = await this.db.seat_inventory.findUnique({ where: { flight_id_cabin: { flight_id: flightId, cabin } } })
    if (!row) return 0
    const capacity = Number(row.capacity)
    if (!Number.isFinite(capacity) || capacity <= 0) return 0
    const pct = (cashSeats(row) / capacity) * 100
    return Math.round(Math.min(100, Math.max(0, pct)) * 100) / 100
  }
}
