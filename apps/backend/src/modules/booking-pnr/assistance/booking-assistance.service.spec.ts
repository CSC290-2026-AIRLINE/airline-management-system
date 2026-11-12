import type { DbService } from '@backend/db/db.service'
import type { BookingEventBus, BookingReadPort, BookingTransaction } from '../contracts'
import type { AssistanceService } from './assistance.service'
import { BookingAssistanceService } from './booking-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./assistance.service', () => ({ AssistanceService: class {} }))

describe('BookingAssistanceService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const lock = jest.fn()
  const tx = { $queryRaw: lock } as unknown as BookingTransaction
  const commit = jest.fn()
  const transaction = jest.fn(async (callback: (transaction: BookingTransaction) => Promise<unknown>) => {
    const value = await callback(tx)
    commit()
    return value
  })
  const createForHold = jest.fn()
  const getBookingDetail = jest.fn()
  const customer = { findFirst: jest.fn() }
  const staff = { findFirst: jest.fn() }
  const events = { publish: jest.fn() }
  const service = new BookingAssistanceService(
    { $transaction: transaction, customer, staff } as unknown as DbService,
    { createForHold } as unknown as AssistanceService,
    { getBookingDetail } as unknown as BookingReadPort,
    { now: () => now },
    events as unknown as BookingEventBus,
  )
  const request = { bookingPassengerId: 'passenger', bookingSegmentId: 'segment', serviceCode: 'WCHR' as const }

  beforeEach(() => {
    jest.clearAllMocks()
    lock.mockResolvedValue([{ status: 'confirmed' }])
    getBookingDetail.mockResolvedValue({
      bookingId: 'booking',
      reference: 'ABC123',
      customerId: 'customer',
      segments: [{ bookingSegmentId: 'segment', flightId: 'flight' }],
    })
    createForHold.mockResolvedValue(undefined)
    customer.findFirst.mockResolvedValue({ id: 'customer' })
    staff.findFirst.mockResolvedValue(null)
    events.publish.mockResolvedValue(undefined)
  })

  it('authorizes the booking and creates the request in a transaction', async () => {
    await service.request('ABC123', { customerId: 'customer' }, request)
    expect(getBookingDetail).toHaveBeenCalledWith('ABC123', { customerId: 'customer' })
    expect(createForHold).toHaveBeenCalledWith(tx, [{ ...request, bookingId: 'booking', requestedAt: now }])
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'service_request.updated',
        bookingId: 'booking',
        flightIds: ['flight'],
        occurredAt: now,
      }),
    )
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(events.publish.mock.invocationCallOrder[0])
  })

  it('does not disclose a booking to an unknown viewer', async () => {
    await expect(service.request('ABC123', {}, request)).rejects.toThrow('Booking not found')
    expect(getBookingDetail).not.toHaveBeenCalled()
  })

  it('does not write when the booking belongs to someone else', async () => {
    getBookingDetail.mockResolvedValue(null)
    await expect(service.request('ABC123', { customerId: 'other' }, request)).rejects.toThrow('Booking not found')
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rechecks status after locking and refuses a closed booking', async () => {
    lock.mockResolvedValue([{ status: 'cancelled' }])
    await expect(service.request('ABC123', { customerId: 'customer' }, request)).rejects.toMatchObject({ code: 'BOOKING_CLOSED' })
    expect(createForHold).not.toHaveBeenCalled()
    expect(events.publish).not.toHaveBeenCalled()
  })

  it('derives the customer viewer from the signed-in user', async () => {
    await service.requestForUser('ABC123', 'user', request)
    expect(getBookingDetail).toHaveBeenCalledWith('ABC123', { customerId: 'customer' })
  })

  it('does not use an inactive or missing customer as a staff viewer', async () => {
    customer.findFirst.mockResolvedValue(null)
    await expect(service.requestForUser('ABC123', 'user', request)).rejects.toMatchObject({ status: 404 })
    expect(getBookingDetail).not.toHaveBeenCalled()
  })

  it('allows an active staff user to request assistance for a booking', async () => {
    customer.findFirst.mockResolvedValue(null)
    staff.findFirst.mockResolvedValue({ id: 'staff' })
    await service.requestForUser('ABC123', 'user', request)
    expect(getBookingDetail).toHaveBeenCalledWith('ABC123', { staff: true })
  })
})
