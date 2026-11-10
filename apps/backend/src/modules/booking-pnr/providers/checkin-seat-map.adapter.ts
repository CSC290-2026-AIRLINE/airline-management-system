import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SeatMapService } from '../seats/seat-map.service'
import type { Cabin, SeatMap, SeatMapSeat, SeatType } from './feature6.types'

@Injectable()
export class CheckinSeatMapAdapter {
  constructor(
    private readonly seatMaps: SeatMapService,
    private readonly db: DbService,
  ) {}

  async seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }): Promise<SeatMap> {
    const [map, ownSeats] = await Promise.all([
      this.seatMaps.getSeatMap(flightId),
      viewer.bookingPassengerId
        ? this.db.seat_assignment.findMany({
            where: {
              flight_id: flightId,
              status: { in: ['held', 'assigned'] },
              booking_coupon: { booking_passenger_id: viewer.bookingPassengerId },
            },
            select: { seat_code: true },
          })
        : Promise.resolve([]),
    ])
    const own = new Set(ownSeats.map((seat) => seat.seat_code))
    return {
      flightId,
      rows: map.rows.map((row) => ({
        row: row.row,
        exitRow: row.seats.some((seat) => seat.type === 'exit'),
        seats: row.seats.map((seat): SeatMapSeat => {
          const type: SeatType =
            seat.type === 'extra_legroom' ? 'front' : seat.type === 'exit' ? 'exit' : seat.cabin === 'business' ? 'business' : 'standard'
          const status: SeatMapSeat['status'] =
            seat.state === 'blocked' || (viewer.cabin !== null && viewer.cabin !== seat.cabin)
              ? 'blocked'
              : own.has(seat.seatCode)
                ? 'mine'
                : seat.state === 'available'
                  ? 'free'
                  : seat.state
          return { code: seat.seatCode, row: seat.row, letter: seat.column, cabin: seat.cabin, type, status, fee: seat.fee }
        }),
      })),
    }
  }
}
