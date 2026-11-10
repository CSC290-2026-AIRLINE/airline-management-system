import type { BookingTransaction, FlightEvent, InventoryPort } from '../contracts'
import { AircraftChangeProcessor } from './aircraft-change.processor'

describe('AircraftChangeProcessor', () => {
  const aircraft = { findMany: jest.fn() }
  const inventoryRows = { findMany: jest.fn() }
  const seats = { findMany: jest.fn(), updateMany: jest.fn() }
  const tx = { aircraft, seat_inventory: inventoryRows, seat_assignment: seats } as unknown as BookingTransaction
  const inventory = { setCapacity: jest.fn() }
  const maps = { getSeatMap: jest.fn() }
  const now = new Date('2026-11-10T12:00:00Z')
  const processor = new AircraftChangeProcessor(inventory as unknown as InventoryPort, maps, { now: () => now })
  const event: FlightEvent = {
    id: 'event',
    seq: 1n,
    flightId: 'flight',
    type: 'flight.aircraft_changed',
    occurredAt: now,
    oldAircraftId: 'old',
    newAircraftId: 'new',
    resolution: null,
    partnerAirline: null,
  }

  beforeEach(() => {
    jest.resetAllMocks()
    aircraft.findMany.mockResolvedValue([
      { id: 'old', aircraft_type_id: 'old-type' },
      { id: 'new', aircraft_type_id: 'new-type' },
    ])
    inventoryRows.findMany.mockResolvedValue([{ cabin: 'economy' }])
    maps.getSeatMap.mockResolvedValue({
      cabins: [{ cabin: 'economy', capacity: 1 }],
      rows: [{ seats: [{ seatCode: '1A', cabin: 'economy', blocked: false }] }],
    })
    seats.findMany.mockResolvedValue([
      { id: 's1', seat_code: '1A', booking_coupon_id: 'c1', booking_coupon: { booking_segment: { cabin: 'economy' } } },
      { id: 's2', seat_code: '1B', booking_coupon_id: 'c2', booking_coupon: { booking_segment: { cabin: 'economy' } } },
    ])
    seats.updateMany.mockResolvedValue({ count: 1 })
    inventory.setCapacity.mockResolvedValue(undefined)
  })

  it('updates capacity and releases only seats missing from the new layout', async () => {
    await expect(processor.process(tx, event)).resolves.toEqual({ releasedCouponIds: ['c2'] })
    expect(inventory.setCapacity).toHaveBeenCalledWith(tx, 'flight', 'economy', 1)
    expect(seats.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['s2'] }, status: { in: ['held', 'assigned'] } } }),
    )
  })

  it('does nothing when both aircraft have the same type', async () => {
    aircraft.findMany.mockResolvedValue([
      { id: 'old', aircraft_type_id: 'same' },
      { id: 'new', aircraft_type_id: 'same' },
    ])
    await expect(processor.process(tx, event)).resolves.toEqual({ releasedCouponIds: [] })
    expect(maps.getSeatMap).not.toHaveBeenCalled()
  })

  it('fails safely if a new cabin needs inventory creation', async () => {
    maps.getSeatMap.mockResolvedValue({ cabins: [{ cabin: 'business', capacity: 3 }], rows: [] })
    await expect(processor.process(tx, event)).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE' })
    expect(inventory.setCapacity).not.toHaveBeenCalled()
    expect(seats.updateMany).not.toHaveBeenCalled()
  })
})
