import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { PRICING_PORT, SEAT_MAP_PORT, type PricingPort, type SeatMapPort, type SeatState } from '../contracts'

@Injectable()
export class SeatMapService {
  constructor(
    private readonly db: DbService,
    @Inject(SEAT_MAP_PORT) private readonly layouts: SeatMapPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
  ) {}

  async getSeatMap(flightId: string) {
    const flight = await this.db.flight.findUnique({ where: { id: flightId }, select: { id: true } })
    if (!flight) throw new NotFoundException('Flight not found')

    const [layout, assignments] = await Promise.all([
      this.layouts.getSeatMap(flightId),
      this.db.seat_assignment.findMany({
        where: { flight_id: flightId, status: { in: ['held', 'assigned'] } },
        select: { seat_code: true, status: true },
      }),
    ])
    const states = new Map(assignments.map((assignment) => [assignment.seat_code, assignment.status]))
    const feeKeys = new Map(layout.rows.flatMap((row) => row.seats).map((seat) => [`${seat.cabin}:${seat.type}`, seat] as const))
    const fees = new Map(
      await Promise.all(
        [...feeKeys].map(
          async ([key, seat]) => [key, await this.pricing.seatFee({ flightId, cabin: seat.cabin, seatType: seat.type })] as const,
        ),
      ),
    )

    return {
      flightId,
      cabins: layout.cabins,
      rows: layout.rows.map((row) => ({
        row: row.row,
        seats: row.seats.map((seat) => {
          const assignment = states.get(seat.seatCode)
          const state: SeatState = seat.blocked
            ? 'blocked'
            : assignment === 'held'
              ? 'held'
              : assignment === 'assigned'
                ? 'taken'
                : 'available'
          return {
            seatCode: seat.seatCode,
            row: seat.row,
            column: seat.column,
            cabin: seat.cabin,
            type: seat.type,
            state,
            fee: fees.get(`${seat.cabin}:${seat.type}`) ?? 0,
          }
        }),
      })),
    }
  }
}
