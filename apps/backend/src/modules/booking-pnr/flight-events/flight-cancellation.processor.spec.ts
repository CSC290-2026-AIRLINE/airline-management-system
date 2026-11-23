import type { BookingTransaction, FlightEvent } from '../contracts'
import { FlightCancellationProcessor } from './flight-cancellation.processor'

describe('FlightCancellationProcessor', () => {
  const clock = new Date('2026-11-10T10:00:00Z')
  const receipts = { findUnique: jest.fn(), create: jest.fn() }
  const bookings = { findMany: jest.fn() }
  const seats = { updateMany: jest.fn() }
  const cancellation = { cancelBookingsForFlight: jest.fn() }
  const lockEvent = jest.fn()
  const tx = {
    $queryRaw: lockEvent,
    flight_event_receipt: receipts,
    booking: bookings,
    seat_assignment: seats,
  } as unknown as BookingTransaction
  const processor = new FlightCancellationProcessor(cancellation, { now: () => clock })
  const event: FlightEvent = {
    id: 'event',
    seq: 1n,
    flightId: 'flight',
    type: 'flight.cancelled',
    occurredAt: clock,
    oldAircraftId: null,
    newAircraftId: null,
    resolution: 'refund',
    partnerAirline: null,
  }

  beforeEach(() => {
    jest.resetAllMocks()
    lockEvent.mockResolvedValue([{ id: 'event', flight_id: 'flight', type: 'cancelled', resolution: 'refund', partner_airline: null }])
    receipts.findUnique.mockResolvedValue(null)
    receipts.create.mockResolvedValue({})
    bookings.findMany.mockResolvedValue([{ id: 'expired-booking' }])
    seats.updateMany.mockResolvedValue({ count: 1 })
    cancellation.cancelBookingsForFlight.mockResolvedValue({
      eventId: 'event',
      affectedBookingIds: ['expired-booking', 'confirmed-booking'],
      cancelledCouponIds: ['coupon'],
    })
  })

  it('applies B’s policy and releases the appropriate seats before recording the receipt', async () => {
    await expect(processor.process(tx, event)).resolves.toMatchObject({ eventId: 'event' })
    expect(lockEvent).toHaveBeenCalledTimes(1)
    expect(lockEvent.mock.invocationCallOrder[0]).toBeLessThan(receipts.findUnique.mock.invocationCallOrder[0])
    expect(cancellation.cancelBookingsForFlight).toHaveBeenCalledWith(tx, 'flight', event)
    expect(seats.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ booking_coupon_id: { in: ['coupon'] } }, { booking_coupon: { booking_id: { in: ['expired-booking'] } } }],
        }),
      }),
    )
    expect(receipts.create).toHaveBeenCalledWith({ data: { event_id: 'event', processed_at: clock } })
  })

  it('does not process an event that no longer exists', async () => {
    lockEvent.mockResolvedValue([])
    await expect(processor.process(tx, event)).rejects.toThrow('Flight event not found')
    expect(cancellation.cancelBookingsForFlight).not.toHaveBeenCalled()
  })

  it.each([
    { id: 'event', flight_id: 'another-flight', type: 'cancelled', resolution: 'refund', partner_airline: null },
    { id: 'event', flight_id: 'flight', type: 'created', resolution: 'refund', partner_airline: null },
    { id: 'event', flight_id: 'flight', type: 'cancelled', resolution: 'rebook_partner', partner_airline: 'EX' },
  ])('does not process an event that differs from the stored record', async (stored) => {
    lockEvent.mockResolvedValue([stored])
    await expect(processor.process(tx, event)).rejects.toThrow('does not match')
    expect(cancellation.cancelBookingsForFlight).not.toHaveBeenCalled()
    expect(receipts.create).not.toHaveBeenCalled()
  })

  it('skips an event that already has a receipt', async () => {
    receipts.findUnique.mockResolvedValue({ event_id: 'event' })
    await expect(processor.process(tx, event)).resolves.toBeNull()
    expect(cancellation.cancelBookingsForFlight).not.toHaveBeenCalled()
    expect(seats.updateMany).not.toHaveBeenCalled()
  })

  it('does not record a receipt if the cancellation policy fails', async () => {
    cancellation.cancelBookingsForFlight.mockRejectedValue(new Error('Cancellation failed'))
    await expect(processor.process(tx, event)).rejects.toThrow('Cancellation failed')
    expect(seats.updateMany).not.toHaveBeenCalled()
    expect(receipts.create).not.toHaveBeenCalled()
  })
})
