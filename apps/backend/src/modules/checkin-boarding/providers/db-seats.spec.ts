import type { DbService } from '@backend/db/db.service'
import { DbSeats } from './db-seats'
import { FixtureClock } from './fixture-providers'

// The generated Prisma client is ESM only: the provider under test never reaches a real database.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-11T01:00:00.000Z')
const clock = new FixtureClock()

const seatRow = (over: Record<string, unknown> = {}) => ({
  id: 'sa-1',
  booking_coupon_id: 'bc-1',
  flight_id: 'flt-fy204',
  seat_code: '5B',
  status: 'held',
  hold_expires_at: new Date(NOW.getTime() + 300_000),
  fee_amount: 0,
  payment_id: null,
  assigned_at: null,
  released_at: null,
  ...over,
})

const couponRow = {
  id: 'bc-1',
  booking_passenger_id: 'bp-1',
  flight_id: 'flt-fy204',
  booking_segment: { cabin: 'economy' },
}

function build(over: Record<string, unknown> = {}) {
  const db = {
    seat_assignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(seatRow()),
      update: jest.fn().mockResolvedValue(seatRow({ status: 'assigned' })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    booking_coupon: { findFirst: jest.fn().mockResolvedValue(couponRow) },
    seat_fee: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  }
  return { seats: new DbSeats(db as unknown as DbService, clock), db }
}

const statusOf = async (seats: DbSeats, code: string, viewer: { bookingPassengerId: string | null; cabin: 'economy' | null }) => {
  const map = await seats.seatMap('flt-fy204', viewer)
  return map.rows.flatMap((row) => row.seats).find((seat) => seat.code === code)?.status
}

describe('DbSeats', () => {
  it('a live hold by someone else shows the seat as taken', async () => {
    const { seats, db } = build()
    db.seat_assignment.findMany.mockResolvedValue([seatRow()])
    await expect(statusOf(seats, '5B', { bookingPassengerId: null, cabin: null })).resolves.toBe('taken')
  })

  it('an expired hold does not take the seat', async () => {
    const { seats, db } = build()
    db.seat_assignment.findMany.mockResolvedValue([seatRow({ hold_expires_at: new Date(NOW.getTime() - 1) })])
    await expect(statusOf(seats, '5B', { bookingPassengerId: null, cabin: null })).resolves.toBe('free')
  })

  it('the seat of another cabin is blocked for the viewer', async () => {
    const { seats } = build()
    await expect(statusOf(seats, '1A', { bookingPassengerId: 'bp-1', cabin: 'economy' })).resolves.toBe('blocked')
  })

  it('holding a taken seat raises SEAT_TAKEN', async () => {
    const { seats, db } = build()
    db.seat_assignment.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    await expect(seats.hold('flt-fy204', '5B', 'bp-1', 300_000)).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
  })

  it('a hold writes the coupon, the flight and the expiry', async () => {
    const { seats, db } = build()
    await seats.hold('flt-fy204', '5B', 'bp-1', 300_000)
    expect(db.seat_assignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        booking_coupon_id: 'bc-1',
        flight_id: 'flt-fy204',
        seat_code: '5B',
        status: 'held',
        hold_expires_at: new Date(NOW.getTime() + 300_000),
      }),
    })
  })

  it('a seat of another cabin cannot be held', async () => {
    const { seats } = build()
    await expect(seats.hold('flt-fy204', '1A', 'bp-1', 300_000)).rejects.toMatchObject({ code: 'SEAT_TAKEN' })
  })

  it('confirming a paid seat records the payment id', async () => {
    const { seats, db } = build()
    db.seat_assignment.findUnique.mockResolvedValue(seatRow())
    await seats.confirm('sa-1', 'pay-1')
    expect(db.seat_assignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'assigned', payment_id: 'pay-1' }) }),
    )
  })

  it('an expired hold cannot be confirmed', async () => {
    const { seats, db } = build()
    db.seat_assignment.findUnique.mockResolvedValue(seatRow({ hold_expires_at: new Date(NOW.getTime() - 1) }))
    await expect(seats.confirm('sa-1', null)).rejects.toMatchObject({ code: 'LOCK_EXPIRED' })
  })

  it('the assigned seat of a passenger is read back', async () => {
    const { seats, db } = build()
    db.seat_assignment.findFirst.mockResolvedValue(seatRow({ status: 'assigned', seat_code: '18B' }))
    await expect(seats.assigned('bp-1')).resolves.toEqual({ seatCode: '18B', type: 'standard' })
  })

  it('assignAnyStandard takes a free standard seat of the cabin', async () => {
    const { seats, db } = build()
    db.seat_assignment.create.mockResolvedValue(seatRow({ status: 'assigned', seat_code: '6A' }))
    await expect(seats.assignAnyStandard('flt-fy204', 'bp-1', { avoidExitRow: true })).resolves.toEqual({
      seatCode: '6A',
      type: 'standard',
    })
  })

  it('assignAnyStandard skips a seat that is taken', async () => {
    const { seats, db } = build()
    db.seat_assignment.findMany.mockResolvedValue([seatRow({ status: 'assigned', seat_code: '6A' })])
    db.seat_assignment.create.mockResolvedValue(seatRow({ status: 'assigned', seat_code: '6B' }))
    await expect(seats.assignAnyStandard('flt-fy204', 'bp-1', { avoidExitRow: true })).resolves.toMatchObject({ seatCode: '6B' })
  })
})
