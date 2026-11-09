import type { BookingTransaction } from '../contracts'
import { SeatService } from './seat.service'

describe('SeatService', () => {
  const couponFind = jest.fn()
  const create = jest.fn()
  const updateMany = jest.fn()
  const tx = { booking_coupon: { findFirst: couponFind }, seat_assignment: { create, updateMany } } as unknown as BookingTransaction
  const layout = { getSeatMap: jest.fn() }
  const service = new SeatService(layout)
  const choice = { bookingCouponId: 'coupon', flightId: 'flight', seatCode: '12A' }
  const expiry = new Date('2026-11-12T10:00:00Z')

  beforeEach(() => {
    jest.resetAllMocks()
    couponFind.mockResolvedValue({
      id: 'coupon',
      booking_segment_id: 'segment',
      booking_segment: { cabin: 'economy' },
      booking_passenger: { passenger_type: 'adult', other_booking_passenger: null, booking_service_request: [] },
    })
    layout.getSeatMap.mockResolvedValue({ rows: [{ seats: [{ seatCode: '12A', cabin: 'economy', type: 'exit', blocked: false }] }] })
    create.mockResolvedValue({})
    updateMany.mockResolvedValue({ count: 1 })
  })

  it('holds a permitted seat until the booking expiry', async () => {
    await service.holdForBooking(tx, 'booking', [choice], expiry)
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'held', seat_code: '12A', hold_expires_at: expiry }) })
  })

  it('rejects exit seats for passengers with an infant or assistance request', async () => {
    couponFind.mockResolvedValue({
      id: 'coupon',
      booking_segment_id: 'segment',
      booking_segment: { cabin: 'economy' },
      booking_passenger: { passenger_type: 'adult', other_booking_passenger: { id: 'infant' }, booking_service_request: [] },
    })
    await expect(service.holdForBooking(tx, 'booking', [choice], expiry)).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED' })
    expect(create).not.toHaveBeenCalled()
  })

  it('translates a concurrent duplicate seat into SEAT_UNAVAILABLE', async () => {
    create.mockRejectedValue({ code: 'P2002' })
    await expect(service.holdForBooking(tx, 'booking', [choice], expiry)).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' })
  })

  it('confirms and releases the booking seats', async () => {
    await service.assignHeldForBooking(tx, 'booking', expiry)
    await service.releaseForBooking(tx, 'booking', expiry)
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ status: 'assigned', assigned_at: expiry }) }),
    )
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ status: 'released', released_at: expiry }) }),
    )
  })
})
