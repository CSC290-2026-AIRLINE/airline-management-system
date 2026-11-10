import type { DbService } from '@backend/db/db.service'
import { SeatHoldExpiryService } from './seat-hold-expiry.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('SeatHoldExpiryService', () => {
  const updateMany = jest.fn()
  const now = new Date('2026-11-12T10:00:00Z')
  const service = new SeatHoldExpiryService({ seat_assignment: { updateMany } } as unknown as DbService, { now: () => now })

  beforeEach(() => {
    jest.clearAllMocks()
    updateMany.mockResolvedValue({ count: 2 })
  })

  it('releases only held seats whose expiry has passed according to the booking clock', async () => {
    await expect(service.sweep()).resolves.toBe(2)
    expect(updateMany).toHaveBeenCalledWith({
      where: { status: 'held', hold_expires_at: { lte: now }, booking_coupon: { booking_segment: { booking: { status: 'confirmed' } } } },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  })

  it('starts and stops a one-minute timer', () => {
    jest.useFakeTimers()
    service.onModuleInit()
    expect(jest.getTimerCount()).toBe(1)
    service.onModuleDestroy()
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })
})
