import type { BookingEventBus, BookingReadPort, CancelForFlightResult, FlightEvent } from '../contracts'
import { FlightEventNotificationsService } from './flight-event-notifications.service'

describe('FlightEventNotificationsService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const bookings = { listStaffBookings: jest.fn(), getBooking: jest.fn() }
  const events = { publish: jest.fn() }
  const service = new FlightEventNotificationsService(bookings as unknown as BookingReadPort, events as unknown as BookingEventBus, {
    now: () => now,
  })
  const flight: FlightEvent = {
    id: 'event',
    seq: 1n,
    flightId: 'flight',
    type: 'flight.cancelled',
    occurredAt: now,
    oldAircraftId: null,
    newAircraftId: null,
    resolution: 'refund',
    partnerAirline: null,
  }
  const result: CancelForFlightResult = { eventId: 'event', affectedBookingIds: ['booking'], cancelledCouponIds: ['coupon'] }
  const summary = { bookingId: 'booking', reference: 'ABC123', customerId: 'customer' }

  beforeEach(() => {
    jest.resetAllMocks()
    bookings.listStaffBookings.mockResolvedValue({ items: [summary], page: 1, pageSize: 100, total: 1 })
    bookings.getBooking.mockResolvedValue({ ...summary, coupons: [{ couponId: 'coupon', flightId: 'flight' }] })
    events.publish.mockResolvedValue(undefined)
  })

  it('publishes cancellation for affected bookings using the booking clock', async () => {
    await service.cancellation(flight, result)
    expect(bookings.listStaffBookings).toHaveBeenCalledWith({ flightId: 'flight', page: 1, pageSize: 100 })
    expect(events.publish).toHaveBeenCalledWith({
      type: 'booking.cancelled',
      bookingId: 'booking',
      reference: 'ABC123',
      customerId: 'customer',
      flightIds: ['flight'],
      occurredAt: now,
      cancelReason: 'flight_cancelled',
    })
  })

  it('publishes partner rebooking and does not call a refund service', async () => {
    await service.cancellation({ ...flight, resolution: 'rebook_partner', partnerAirline: 'EX' }, result)
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'booking.partner_rebooked', cancelReason: 'rebooked_partner' }),
    )
  })

  it('resolves released seats through the booking-read interface and publishes once per booking', async () => {
    bookings.getBooking.mockResolvedValue({
      ...summary,
      coupons: [
        { couponId: 'coupon', flightId: 'flight' },
        { couponId: 'coupon-2', flightId: 'flight' },
      ],
    })
    await service.seatsChanged('flight', ['coupon', 'coupon-2'])
    expect(bookings.getBooking).toHaveBeenCalledWith('ABC123')
    expect(events.publish).toHaveBeenCalledTimes(1)
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'booking.seat_changed', bookingId: 'booking' }))
  })

  it('does not silently publish incomplete information if an affected booking cannot be resolved', async () => {
    bookings.listStaffBookings.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 })
    await expect(service.cancellation(flight, result)).rejects.toThrow('Could not resolve all affected bookings')
    expect(events.publish).not.toHaveBeenCalled()
  })

  it('reads all result pages', async () => {
    bookings.listStaffBookings
      .mockResolvedValueOnce({ items: [{ bookingId: 'other', reference: 'ZZZ222', customerId: 'other' }], page: 1, pageSize: 1, total: 2 })
      .mockResolvedValueOnce({ items: [summary], page: 2, pageSize: 1, total: 2 })
    await service.cancellation(flight, result)
    expect(bookings.listStaffBookings).toHaveBeenCalledTimes(2)
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 'booking' }))
  })
})
