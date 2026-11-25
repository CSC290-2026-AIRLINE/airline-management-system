import { NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { PricingPort } from '../contracts'
import { SeatMapService } from './seat-map.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('SeatMapService', () => {
  const flight = { findUnique: jest.fn() }
  const seatAssignment = { findMany: jest.fn() }
  const layout = { getSeatMap: jest.fn() }
  const pricing = { seatFee: jest.fn() }
  const service = new SeatMapService(
    { flight, seat_assignment: seatAssignment } as unknown as DbService,
    layout,
    pricing as unknown as PricingPort,
  )

  beforeEach(() => {
    jest.resetAllMocks()
    flight.findUnique.mockResolvedValue({ id: 'flight' })
    seatAssignment.findMany.mockResolvedValue([
      { seat_code: '1A', status: 'held' },
      { seat_code: '1B', status: 'assigned' },
      { seat_code: '1C', status: 'held' },
    ])
    layout.getSeatMap.mockResolvedValue({
      cabins: [{ cabin: 'economy', capacity: 3 }],
      rows: [
        {
          row: 1,
          seats: ['A', 'B', 'C', 'D'].map((column) => ({
            seatCode: `1${column}`,
            row: 1,
            column,
            cabin: 'economy',
            type: 'standard',
            blocked: column === 'C',
          })),
        },
      ],
    })
    pricing.seatFee.mockResolvedValue(12)
  })

  it('combines assignments and blocked seats with the layout and prices', async () => {
    const result = await service.getSeatMap('flight')
    expect(result.rows[0].seats.map((seat) => seat.state)).toEqual(['held', 'taken', 'blocked', 'available'])
    expect(result.rows[0].seats[0].fee).toBe(12)
    expect(pricing.seatFee).toHaveBeenCalledTimes(1)
    expect(seatAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flight_id: 'flight', status: { in: ['held', 'assigned'] } },
      }),
    )
  })

  it('rejects an unknown flight before fetching a layout', async () => {
    flight.findUnique.mockResolvedValue(null)
    await expect(service.getSeatMap('missing')).rejects.toBeInstanceOf(NotFoundException)
    expect(layout.getSeatMap).not.toHaveBeenCalled()
  })
})
