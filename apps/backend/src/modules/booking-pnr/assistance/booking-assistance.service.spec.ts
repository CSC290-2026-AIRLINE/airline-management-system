import type { DbService } from '@backend/db/db.service'
import type { BookingReadPort, BookingTransaction } from '../contracts'
import type { AssistanceService } from './assistance.service'
import { BookingAssistanceService } from './booking-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./assistance.service', () => ({ AssistanceService: class {} }))

describe('BookingAssistanceService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const lock = jest.fn()
  const tx = { $queryRaw: lock } as unknown as BookingTransaction
  const transaction = jest.fn((callback: (transaction: BookingTransaction) => Promise<unknown>) => callback(tx))
  const createForHold = jest.fn()
  const getBookingDetail = jest.fn()
  const service = new BookingAssistanceService(
    { $transaction: transaction } as unknown as DbService,
    { createForHold } as unknown as AssistanceService,
    { getBookingDetail } as unknown as BookingReadPort,
    { now: () => now },
  )
  const request = { bookingPassengerId: 'passenger', bookingSegmentId: 'segment', serviceCode: 'WCHR' as const }

  beforeEach(() => {
    jest.clearAllMocks()
    lock.mockResolvedValue([{ status: 'confirmed' }])
    getBookingDetail.mockResolvedValue({ bookingId: 'booking' })
    createForHold.mockResolvedValue(undefined)
  })

  it('authorizes the booking and creates the request in a transaction', async () => {
    await service.request('ABC123', { customerId: 'customer' }, request)
    expect(getBookingDetail).toHaveBeenCalledWith('ABC123', { customerId: 'customer' })
    expect(createForHold).toHaveBeenCalledWith(tx, [{ ...request, bookingId: 'booking', requestedAt: now }])
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
  })
})
