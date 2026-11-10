import type { DbService } from '@backend/db/db.service'
import type { CheckinSeatMapAdapter } from './checkin-seat-map.adapter'
import { CheckinSeatProvider } from './checkin-seat.provider'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('CheckinSeatProvider', () => {
  const now = new Date('2026-11-10T12:00:00Z')
  const findCoupon = jest.fn()
  const create = jest.fn()
  const findMany = jest.fn()
  const updateMany = jest.fn()
  const findUniqueOrThrow = jest.fn()
  const findUnique = jest.fn()
  const findCouponById = jest.fn()
  const findCheckIn = jest.fn()
  const update = jest.fn()
  const query = jest.fn()
  const tx = {
    $queryRaw: query,
    seat_assignment: { findUnique, findUniqueOrThrow, updateMany, update, create },
    booking_coupon: { findUnique: findCouponById, findFirst: findCoupon },
    check_in: { findFirst: findCheckIn },
  }
  const db = {
    booking_coupon: { findFirst: findCoupon },
    seat_assignment: { create, findMany, updateMany },
    $transaction: jest.fn((fn: (arg: typeof tx) => unknown) => fn(tx)),
  }
  const maps = { seatMap: jest.fn() }
  const layouts = { getSeatMap: jest.fn() }
  const provider = new CheckinSeatProvider(
    db as unknown as DbService,
    maps as unknown as CheckinSeatMapAdapter,
    { now: () => now },
    layouts,
  )

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((fn) => fn(tx))
    findCheckIn.mockResolvedValue(null)
    findCoupon.mockResolvedValue({
      id: 'coupon',
      booking_id: 'booking',
      booking_segment_id: 'segment',
      booking_segment: { cabin: 'economy' },
      booking_passenger: { passenger_type: 'adult', other_booking_passenger: null, booking_service_request: [] },
    })
    layouts.getSeatMap.mockResolvedValue({ rows: [{ seats: [{ seatCode: '12A', cabin: 'economy', type: 'exit', blocked: false }] }] })
    maps.seatMap.mockResolvedValue({ rows: [{ seats: [{ code: '12A', status: 'free', fee: 0 }] }] })
    create.mockResolvedValue({ id: 'lock' })
    query.mockResolvedValue([{ id: 'lock', status: 'confirmed' }])
    findUnique.mockResolvedValue({ booking_coupon: { booking_id: 'booking' } })
    findCouponById.mockResolvedValue({ status: 'confirmed', booking_passenger_id: 'passenger', flight_id: 'flight' })
    findUniqueOrThrow.mockResolvedValue({
      id: 'lock',
      flight_id: 'flight',
      seat_code: '12A',
      status: 'held',
      hold_expires_at: new Date('2026-11-10T12:05:00Z'),
      fee_amount: 0,
      payment_id: null,
      booking_coupon_id: 'coupon',
    })
    updateMany.mockResolvedValue({ count: 1 })
    update.mockResolvedValue({})
  })

  it('creates a timed hold for a valid seat', async () => {
    await expect(provider.hold('flight', '12A', 'passenger', 300_000)).resolves.toMatchObject({
      id: 'lock',
      seatCode: '12A',
      expiresAt: '2026-11-10T12:05:00.000Z',
    })
  })

  it('rejects an exit seat when a passenger has an infant', async () => {
    findCoupon.mockResolvedValue({
      id: 'coupon',
      booking_segment_id: 'segment',
      booking_segment: { cabin: 'economy' },
      booking_passenger: { passenger_type: 'adult', other_booking_passenger: { id: 'infant' }, booking_service_request: [] },
    })
    await expect(provider.hold('flight', '12A', 'passenger', 300_000)).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
    expect(create).not.toHaveBeenCalled()
  })

  it('does not assign a paid seat before payment', async () => {
    findUniqueOrThrow.mockResolvedValue({
      flight_id: 'flight',
      seat_code: '12A',
      status: 'held',
      hold_expires_at: new Date('2026-11-10T12:05:00Z'),
      fee_amount: 12,
      payment_id: null,
    })
    await expect(provider.confirm('lock')).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
    expect(update).not.toHaveBeenCalled()
  })

  it('assigns a valid free seat and releases the previous seat in the same transaction', async () => {
    await expect(provider.confirm('lock')).resolves.toEqual({ seatCode: '12A', type: 'exit' })
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { booking_coupon_id: 'coupon', status: 'assigned' } }))
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lock' }, data: expect.objectContaining({ status: 'assigned' }) }),
    )
  })

  it('does not hold a seat when the booking is cancelled concurrently', async () => {
    query.mockResolvedValue([{ status: 'cancelled' }])
    await expect(provider.hold('flight', '12A', 'passenger', 300_000)).rejects.toMatchObject({ code: 'BOOKING_CLOSED' })
    expect(create).not.toHaveBeenCalled()
  })

  it('rechecks check-in inside the booking transaction for post-booking changes', async () => {
    findCheckIn.mockResolvedValue({ id: 'check-in' })
    await expect(provider.hold('flight', '12A', 'passenger', 300_000, { rejectCheckedIn: true })).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('does not assign a post-booking seat if check-in happened after its hold', async () => {
    findCheckIn.mockResolvedValue({ id: 'check-in' })
    await expect(provider.confirm('lock', { rejectCheckedIn: true })).rejects.toMatchObject({ code: 'BOOKING_CLOSED' })
    expect(findCheckIn).toHaveBeenCalledWith({
      where: { booking_passenger_id: 'passenger', flight_id: 'flight', status: { in: ['checked_in', 'boarded', 'no_show'] } },
      select: { id: true },
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('does not confirm a seat after its booking is cancelled', async () => {
    query.mockResolvedValue([{ status: 'cancelled' }])
    await expect(provider.confirm('lock')).rejects.toMatchObject({ code: 'BOOKING_CLOSED' })
    expect(update).not.toHaveBeenCalled()
  })

  it('does not guess the seat for a passenger with multiple flights', async () => {
    findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    await expect(provider.assigned('passenger')).resolves.toBeNull()
    await expect(provider.releaseAssigned('passenger')).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
  })

  it('can auto-assign a standard business-cabin seat without selecting an exit seat', async () => {
    findCoupon.mockResolvedValue({
      id: 'coupon',
      booking_id: 'booking',
      booking_segment_id: 'segment',
      booking_segment: { cabin: 'business' },
      booking_passenger: { passenger_type: 'adult', other_booking_passenger: null, booking_service_request: [] },
    })
    layouts.getSeatMap.mockResolvedValue({ rows: [{ seats: [{ seatCode: '1A', cabin: 'business', type: 'standard', blocked: false }] }] })
    maps.seatMap.mockResolvedValue({ rows: [{ seats: [{ code: '1A', type: 'business', status: 'free', fee: 0 }] }] })
    findUniqueOrThrow.mockResolvedValue({
      id: 'lock',
      flight_id: 'flight',
      seat_code: '1A',
      status: 'held',
      hold_expires_at: new Date('2026-11-10T12:05:00Z'),
      fee_amount: 0,
      payment_id: null,
      booking_coupon_id: 'coupon',
    })
    await expect(provider.assignAnyStandard('flight', 'passenger')).resolves.toEqual({ seatCode: '1A', type: 'business' })
  })
})
