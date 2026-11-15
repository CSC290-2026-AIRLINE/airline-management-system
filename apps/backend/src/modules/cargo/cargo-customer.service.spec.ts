import { ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { CargoCustomerService } from './cargo-customer.service'
import { CargoEventsService } from './cargo-events.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-10T12:00:00Z')

jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({
  simNow: () => NOW,
}))

jest.mock('./cargo-deps', () => ({
  getAircraftCapacity: jest.fn().mockResolvedValue({ holdLimitKg: 4000, sellableSeats: 180 }),
  seatsTakenOnFlight: jest.fn().mockReturnValue(0),
  refundFull: jest.fn().mockResolvedValue({ refundId: 'refund-1' }),
  loadedBaggageKg: jest.fn().mockReturnValue(null),
}))

function makeDb() {
  return {
    cargo_booking: { findUnique: jest.fn() },
    cargo_shipment_event: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    cargo_notice: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn({})),
  }
}

function makeEventsService() {
  return {
    appendEvent: jest.fn().mockResolvedValue({ status_after: 'cancelled', id: 'evt-c' }),
    currentStatus: jest.fn(),
  }
}

describe('CargoCustomerService.cancelMyBooking', () => {
  let service: CargoCustomerService
  let db: ReturnType<typeof makeDb>
  let events: ReturnType<typeof makeEventsService>

  beforeEach(() => {
    db = makeDb()
    events = makeEventsService()
    const tx = {
      cargo_booking: db.cargo_booking,
      cargo_shipment_event: db.cargo_shipment_event,
      cargo_notice: db.cargo_notice,
      $queryRaw: db.$queryRaw,
    }
    db.$transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
    service = new CargoCustomerService(db as never, {} as never, events as unknown as CargoEventsService)
  })

  it('held cancel has no refund and actor is customer', async () => {
    db.cargo_booking.findUnique.mockResolvedValue({
      id: 'b1',
      customer_id: 'cust-1',
      booking_ref: 'CB-000001',
      payment_id: 'pay-1',
      quoted_charge: '100.00',
    })
    events.currentStatus.mockResolvedValue('held')

    const result = await service.cancelMyBooking('cust-1', 'b1')
    expect(result.status).toBe('cancelled')
    expect(events.appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'cancelled',
        actorType: 'customer',
      }),
    )
    expect(events.appendEvent).toHaveBeenCalledWith(expect.anything(), expect.not.objectContaining({ refundId: expect.anything() }))
  })

  it('booked cancel refunds once and passes refundId', async () => {
    db.cargo_booking.findUnique.mockResolvedValue({
      id: 'b1',
      customer_id: 'cust-1',
      booking_ref: 'CB-000001',
      payment_id: 'pay-1',
      quoted_charge: '100.00',
    })
    events.currentStatus.mockResolvedValue('booked')

    const result = await service.cancelMyBooking('cust-1', 'b1')
    expect(result).toEqual({ status: 'cancelled', refundId: 'refund-1' })
    expect(events.appendEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'cancelled',
        actorType: 'customer',
        refundId: 'refund-1',
      }),
    )
  })

  it('returns 502 with real reason when refund fails on booked cancel', async () => {
    db.cargo_booking.findUnique.mockResolvedValue({
      id: 'b1',
      customer_id: 'cust-1',
      booking_ref: 'CB-000001',
      payment_id: 'pay-1',
      quoted_charge: '100.00',
    })
    events.currentStatus.mockResolvedValue('booked')

    const { refundFull } = jest.requireMock('./cargo-deps')
    refundFull.mockRejectedValueOnce(new Error('check constraint violation'))

    const err = await service.cancelMyBooking('cust-1', 'b1').catch((e) => e)
    expect(err).toBeInstanceOf(InternalServerErrorException)
    expect(err.response.error.message).toContain('check constraint violation')
  })

  it('returns 404 when booking not found', async () => {
    db.cargo_booking.findUnique.mockResolvedValue(null)
    await expect(service.cancelMyBooking('cust-1', 'b1')).rejects.toThrow(NotFoundException)
  })

  it('returns 409 when status does not allow cancel', async () => {
    db.cargo_booking.findUnique.mockResolvedValue({
      id: 'b1',
      customer_id: 'cust-1',
      booking_ref: 'CB-000001',
      payment_id: 'pay-1',
      quoted_charge: '100.00',
    })
    events.currentStatus.mockResolvedValue('delivered')
    await expect(service.cancelMyBooking('cust-1', 'b1')).rejects.toThrow(ConflictException)
  })
})
