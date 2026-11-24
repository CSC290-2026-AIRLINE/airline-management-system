const NOW = new Date('2026-11-10T12:00:00Z')

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({
  simNow: () => NOW,
}))

import { getAircraftCapacity, refundFull, seatsTakenOnFlight } from './cargo-deps'

function makeDb() {
  return {
    aircraft: { findUnique: jest.fn() },
    seat_inventory: { aggregate: jest.fn() },
    flight_setting: { findFirst: jest.fn() },
    refund: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  }
}

describe('refundFull', () => {
  it('maps cancel reason to cargo_cancel and status to succeeded', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-1' })

    await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: 'cargo_cancel',
        status: 'succeeded',
        source_key: 'cargo:CB-000001:cancel',
        completed_at: NOW,
      }),
    })
  })

  it('maps rejected reason to cargo_rejected', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-2' })

    await refundFull(db as never, 'CB-000002', 'pay-2', 200, 'rejected')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'cargo_rejected' }),
    })
  })

  it('maps flight reason to flight_cancelled', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-3' })

    await refundFull(db as never, 'CB-000003', 'pay-3', 300, 'flight')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'flight_cancelled' }),
    })
  })

  it('returns existing refund by source_key (idempotent)', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue({ id: 'existing-r' })

    const result = await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(result).toEqual({ refundId: 'existing-r' })
    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('catches P2002 unique violation and returns existing row', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValueOnce(null)
    db.refund.create.mockRejectedValue({ code: 'P2002' })
    db.refund.findFirst.mockResolvedValueOnce({ id: 'race-r' })

    const result = await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(result).toEqual({ refundId: 'race-r' })
  })

  it('uses a stable source_key without Date.now()', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-x' })

    await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    const call = db.refund.create.mock.calls[0][0].data
    expect(call.source_key).toBe('cargo:CB-000001:cancel')
    expect(call.source_key).not.toMatch(/\d{13}/)
  })
})

describe('seatsTakenOnFlight', () => {
  it('adds the held and sold seats over every cabin', async () => {
    const db = makeDb()
    db.seat_inventory.aggregate.mockResolvedValue({ _sum: { held_count: 12, sold_count: 90 } })
    await expect(seatsTakenOnFlight(db as never, 'f1')).resolves.toBe(102)
    expect(db.seat_inventory.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { flight_id: 'f1' } }))
  })

  it('is zero for a flight with no seat inventory', async () => {
    const db = makeDb()
    db.seat_inventory.aggregate.mockResolvedValue({ _sum: { held_count: null, sold_count: null } })
    await expect(seatsTakenOnFlight(db as never, 'f1')).resolves.toBe(0)
  })
})

describe('getAircraftCapacity', () => {
  const type = (layout: unknown) => ({ aircraft_type: { hold_weight_limit_kg: 18000, layout } })

  it('counts sellable seats from the cabin layout, leaving blocked seats out', async () => {
    const db = makeDb()
    db.aircraft.findUnique.mockResolvedValue(
      type({
        cabins: [{ cabin_class: 'economy', first_row: 1, last_row: 10, columns: ['A', 'B', 'C', 'D'], aisles_after: ['B'] }],
      }),
    )
    await expect(getAircraftCapacity(db as never, 'ac1')).resolves.toEqual({ holdLimitKg: 18000, sellableSeats: 40 })
  })

  it('falls back to 180 seats for a layout that is not in the cabin format', async () => {
    const db = makeDb()
    db.aircraft.findUnique.mockResolvedValue(type({ rows: 30, seats_per_row: 6 }))
    await expect(getAircraftCapacity(db as never, 'ac1')).resolves.toEqual({ holdLimitKg: 18000, sellableSeats: 180 })
  })

  it('falls back when the aircraft is missing', async () => {
    const db = makeDb()
    db.aircraft.findUnique.mockResolvedValue(null)
    await expect(getAircraftCapacity(db as never, 'ac1')).resolves.toEqual({ holdLimitKg: 4000, sellableSeats: 180 })
  })
})
