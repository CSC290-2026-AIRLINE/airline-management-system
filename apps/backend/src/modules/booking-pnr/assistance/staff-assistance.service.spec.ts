import type { DbService } from '@backend/db/db.service'
import type { BookingEventBus, BookingTransaction } from '../contracts'
import type { AssistanceQueueService } from './assistance-queue.service'
import type { AssistanceService } from './assistance.service'
import { StaffAssistanceService } from './staff-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./assistance-queue.service', () => ({ AssistanceQueueService: class {} }))
jest.mock('./assistance.service', () => ({ AssistanceService: class {} }))

describe('StaffAssistanceService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const staff = { findFirst: jest.fn() }
  const requests = { findUnique: jest.fn() }
  const tx = { booking_service_request: requests } as unknown as BookingTransaction
  const commit = jest.fn()
  const transaction = jest.fn(async (callback: (transaction: BookingTransaction) => Promise<unknown>) => {
    const value = await callback(tx)
    commit()
    return value
  })
  const queue = { list: jest.fn() }
  const assistance = { reviewRequest: jest.fn() }
  const events = { publish: jest.fn() }
  const service = new StaffAssistanceService(
    { staff, $transaction: transaction } as unknown as DbService,
    queue as unknown as AssistanceQueueService,
    assistance as unknown as AssistanceService,
    events as unknown as BookingEventBus,
  )

  beforeEach(() => {
    jest.clearAllMocks()
    staff.findFirst.mockResolvedValue({ id: 'staff' })
    requests.findUnique.mockResolvedValue({
      id: 'request',
      booking_id: 'booking',
      booking_passenger_id: 'passenger',
      booking_segment_id: 'segment',
      service_code: 'WCHR',
      note: null,
      requested_at: now,
      booking_passenger: {
        booking: { booking_reference: 'ABC123', customer_id: 'customer', booking_segment: [{ id: 'segment', flight_id: 'flight' }] },
      },
    })
    assistance.reviewRequest.mockResolvedValue({ status: 'accepted', handledAt: now })
    events.publish.mockResolvedValue(undefined)
    queue.list.mockResolvedValue([])
  })

  it('refuses non-staff users before reading the queue', async () => {
    staff.findFirst.mockResolvedValue(null)
    await expect(service.list('customer', {})).rejects.toMatchObject({ status: 403 })
    expect(queue.list).not.toHaveBeenCalled()
  })

  it('passes the status and flight filters to the queue after checking the staff account', async () => {
    await service.list('user', { status: 'requested', flightId: 'flight' })
    expect(staff.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'user', deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    expect(queue.list).toHaveBeenCalledWith({ status: 'requested', flightId: 'flight' })
  })

  it('reviews inside the transaction and publishes only after it completes', async () => {
    await expect(service.review('user', 'request', 'accepted')).resolves.toMatchObject({ status: 'accepted' })
    expect(assistance.reviewRequest).toHaveBeenCalledWith(tx, 'request', 'staff', 'accepted', undefined)
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

  it('does not publish an update if the review fails', async () => {
    assistance.reviewRequest.mockRejectedValue(new Error('Invalid transition'))
    await expect(service.review('user', 'request', 'completed')).rejects.toThrow('Invalid transition')
    expect(events.publish).not.toHaveBeenCalled()
  })
})
