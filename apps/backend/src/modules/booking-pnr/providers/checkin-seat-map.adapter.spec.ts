import type { DbService } from '@backend/db/db.service'
import type { SeatMapService } from '../seats/seat-map.service'
import { CheckinSeatMapAdapter } from './checkin-seat-map.adapter'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('CheckinSeatMapAdapter', () => {
  const getSeatMap = jest.fn()
  const findMany = jest.fn()
  const adapter = new CheckinSeatMapAdapter(
    { getSeatMap } as unknown as SeatMapService,
    { seat_assignment: { findMany } } as unknown as DbService,
  )

  beforeEach(() => {
    jest.resetAllMocks()
    getSeatMap.mockResolvedValue({
      flightId: 'flight',
      rows: [
        {
          row: 12,
          seats: [
            { seatCode: '12A', row: 12, column: 'A', cabin: 'economy', type: 'exit', state: 'taken', fee: 0 },
            { seatCode: '12B', row: 12, column: 'B', cabin: 'economy', type: 'exit', state: 'held', fee: 0 },
            { seatCode: '12C', row: 12, column: 'C', cabin: 'business', type: 'standard', state: 'available', fee: 0 },
          ],
        },
      ],
    })
    findMany.mockResolvedValue([{ seat_code: '12A' }])
  })

  it('maps seat states and highlights the passenger’s own seat and cabin', async () => {
    const result = await adapter.seatMap('flight', { bookingPassengerId: 'passenger', cabin: 'economy' })
    expect(result.rows[0].exitRow).toBe(true)
    expect(result.rows[0].seats.map((seat) => seat.status)).toEqual(['mine', 'held', 'blocked'])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ flight_id: 'flight', booking_coupon: { booking_passenger_id: 'passenger' } }),
      }),
    )
  })

  it('does not look up personal seats for an anonymous viewer', async () => {
    const result = await adapter.seatMap('flight', { bookingPassengerId: null, cabin: null })
    expect(findMany).not.toHaveBeenCalled()
    expect(result.rows[0].seats.map((seat) => seat.status)).toEqual(['taken', 'held', 'free'])
  })
})
