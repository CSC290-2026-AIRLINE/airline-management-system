import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort } from '../contracts'
import type { CheckinSeatProvider } from '../providers/checkin-seat.provider'
import { SeatPaymentService } from './seat-payment.service'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('../providers/checkin-seat.provider', () => ({ CheckinSeatProvider: class {} }))
describe('SeatPaymentService', () => {
  const db = { customer: { findFirst: jest.fn() }, staff: { findFirst: jest.fn() }, seat_assignment: { findFirst: jest.fn() } }
  const seats = { confirm: jest.fn() }
  const bookings = { getBookingDetail: jest.fn() }
  const service = new SeatPaymentService(
    db as unknown as DbService,
    seats as unknown as CheckinSeatProvider,
    bookings as unknown as BookingReadPort,
  )
  beforeEach(() => {
    jest.resetAllMocks()
    db.customer.findFirst.mockResolvedValue({ id: 'customer' })
    db.staff.findFirst.mockResolvedValue(null)
    db.seat_assignment.findFirst.mockResolvedValue({ id: 'lock' })
    bookings.getBookingDetail.mockResolvedValue({ status: 'confirmed', coupons: [{ couponId: 'coupon', status: 'confirmed' }] })
    seats.confirm.mockResolvedValue({ seatCode: '1A', type: 'standard' })
  })
  it('authorizes the booking and coupon before confirming a seat payment', async () => {
    await expect(service.confirmForUser('ABC123', 'coupon', 'lock', 'user')).resolves.toMatchObject({ status: 'assigned' })
    expect(bookings.getBookingDetail).toHaveBeenCalledWith('ABC123', { customerId: 'customer' })
    expect(db.seat_assignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'lock', booking_coupon_id: 'coupon', status: { in: ['held', 'assigned'] } },
      select: { id: true },
    })
    expect(seats.confirm).toHaveBeenCalledWith('lock', { rejectCheckedIn: true, payWithCheckout: true })
  })
  it('does not pay for another customer’s booking', async () => {
    bookings.getBookingDetail.mockResolvedValue(null)
    await expect(service.confirmForUser('ABC123', 'coupon', 'lock', 'user')).rejects.toMatchObject({ status: 404 })
    expect(seats.confirm).not.toHaveBeenCalled()
  })
  it('keeps the staff assignment reason through paid-seat confirmation', async () => {
    db.staff.findFirst.mockResolvedValue({ id: 'staff' })
    await service.confirmForUser('ABC123', 'coupon', 'lock', 'user', 'Airport assistance')
    expect(seats.confirm).toHaveBeenCalledWith('lock', {
      rejectCheckedIn: true,
      payWithCheckout: true,
      staffOverride: { userId: 'user', staffId: 'staff', reason: 'Airport assistance' },
    })
  })
  it('does not accept a staff-assignment reason from a customer', async () => {
    await expect(service.confirmForUser('ABC123', 'coupon', 'lock', 'user', 'Override')).rejects.toMatchObject({ status: 403 })
    expect(seats.confirm).not.toHaveBeenCalled()
  })
  it('does not pay for a lock belonging to a different coupon', async () => {
    db.seat_assignment.findFirst.mockResolvedValue(null)
    await expect(service.confirmForUser('ABC123', 'coupon', 'lock', 'user')).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' })
    expect(seats.confirm).not.toHaveBeenCalled()
  })
})
