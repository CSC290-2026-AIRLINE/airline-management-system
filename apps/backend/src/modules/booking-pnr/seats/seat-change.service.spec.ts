import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort } from '../contracts'
import type { CheckinSeatProvider } from '../providers/checkin-seat.provider'
import { SeatChangeService } from './seat-change.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('../providers/checkin-seat.provider', () => ({ CheckinSeatProvider: class CheckinSeatProvider {} }))

describe('SeatChangeService', () => {
  const checkIn = { findFirst: jest.fn() }
  const customer = { findFirst: jest.fn() }
  const seats = { hold: jest.fn(), confirm: jest.fn(), release: jest.fn() }
  const bookings = { getBookingDetail: jest.fn() }
  const service = new SeatChangeService(
    { check_in: checkIn, customer } as unknown as DbService,
    seats as unknown as CheckinSeatProvider,
    bookings as unknown as BookingReadPort,
  )
  const viewer = { customerId: 'customer' }

  beforeEach(() => {
    jest.resetAllMocks()
    bookings.getBookingDetail.mockResolvedValue({
      status: 'confirmed',
      coupons: [{ couponId: 'coupon', status: 'confirmed', flightId: 'flight', bookingPassengerId: 'passenger' }],
    })
    checkIn.findFirst.mockResolvedValue(null)
    customer.findFirst.mockResolvedValue({ id: 'customer' })
    seats.hold.mockResolvedValue({ id: 'lock', fee: 0 })
    seats.confirm.mockResolvedValue({ seatCode: '12A', type: 'standard' })
    seats.release.mockResolvedValue(undefined)
  })

  it('assigns a free seat after checking booking ownership and check-in', async () => {
    await expect(service.changeSeat('REF', 'coupon', '12A', viewer)).resolves.toMatchObject({
      status: 'assigned',
      seat: { seatCode: '12A' },
    })
    expect(bookings.getBookingDetail).toHaveBeenCalledWith('REF', viewer)
    expect(seats.hold).toHaveBeenCalledWith('flight', '12A', 'passenger', 300_000, { rejectCheckedIn: true })
    expect(seats.confirm).toHaveBeenCalledWith('lock', { rejectCheckedIn: true })
  })

  it('holds a paid seat without assigning it before payment', async () => {
    seats.hold.mockResolvedValue({ id: 'lock', fee: 12 })
    await expect(service.changeSeat('REF', 'coupon', '12A', viewer)).resolves.toMatchObject({
      status: 'payment_required',
      lock: { id: 'lock' },
    })
    expect(seats.confirm).not.toHaveBeenCalled()
  })

  it('refuses a seat change after check-in', async () => {
    checkIn.findFirst.mockResolvedValue({ id: 'check-in' })
    await expect(service.changeSeat('REF', 'coupon', '12A', viewer)).rejects.toMatchObject({ code: 'BOOKING_CLOSED' })
    expect(seats.hold).not.toHaveBeenCalled()
  })

  it('releases the new hold if free-seat confirmation fails', async () => {
    seats.confirm.mockRejectedValue(new Error('failed'))
    await expect(service.changeSeat('REF', 'coupon', '12A', viewer)).rejects.toThrow('failed')
    expect(seats.release).toHaveBeenCalledWith('lock')
  })

  it('does not look up a booking for an unidentified viewer', async () => {
    await expect(service.changeSeat('REF', 'coupon', '12A', {})).rejects.toThrow('Booking not found')
    expect(bookings.getBookingDetail).not.toHaveBeenCalled()
  })

  it('derives the customer from the signed-in user', async () => {
    await service.changeSeatForCustomer('REF', 'coupon', '12A', 'user')
    expect(customer.findFirst).toHaveBeenCalledWith({ where: { user_id: 'user', deleted_at: null }, select: { id: true } })
    expect(bookings.getBookingDetail).toHaveBeenCalledWith('REF', { customerId: 'customer' })
  })

  it('refuses to change a seat without a customer profile', async () => {
    customer.findFirst.mockResolvedValue(null)
    await expect(service.changeSeatForCustomer('REF', 'coupon', '12A', 'user')).rejects.toThrow('Booking not found')
    expect(bookings.getBookingDetail).not.toHaveBeenCalled()
  })
})
