import { NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort } from '../contracts'
import { FlightImpactService } from './flight-impact.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('FlightImpactService', () => {
  const flight = { findUnique: jest.fn() }
  const inventory = { findMany: jest.fn() }
  const counts = { countBookingsForFlight: jest.fn() }
  const service = new FlightImpactService(
    { flight, seat_inventory: inventory } as unknown as DbService,
    counts as unknown as BookingReadPort,
  )

  beforeEach(() => {
    jest.resetAllMocks()
    flight.findUnique.mockResolvedValue({ id: 'flight' })
    counts.countBookingsForFlight.mockResolvedValue({ bookings: 3, passengers: 4, openServiceRequests: 1 })
    inventory.findMany.mockResolvedValue([
      { cabin: 'economy', capacity: 2, held_count: 1, sold_count: 2 },
      { cabin: 'business', capacity: 4, held_count: 1, sold_count: 1 },
    ])
  })

  it('combines booking counts and flags over-capacity cabins', async () => {
    await expect(service.flightImpactSummary('flight')).resolves.toEqual({
      flightId: 'flight',
      bookings: 3,
      passengers: 4,
      openServiceRequests: 1,
      cabins: [
        { cabin: 'economy', capacity: 2, held: 1, sold: 2, overCapacity: true },
        { cabin: 'business', capacity: 4, held: 1, sold: 1, overCapacity: false },
      ],
    })
    expect(counts.countBookingsForFlight).toHaveBeenCalledWith('flight')
  })

  it('rejects an unknown flight', async () => {
    flight.findUnique.mockResolvedValue(null)
    await expect(service.flightImpactSummary('missing')).rejects.toBeInstanceOf(NotFoundException)
    expect(inventory.findMany).not.toHaveBeenCalled()
  })
})
