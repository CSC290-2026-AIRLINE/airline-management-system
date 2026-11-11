import type { DbService } from '@backend/db/db.service'
import type { AssistanceService } from './assistance.service'
import { AssistanceSeedService } from './assistance-seed.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('./assistance.service', () => ({ AssistanceService: class {} }))

describe('AssistanceSeedService', () => {
  const now = new Date('2026-11-11T00:00:00Z')
  const request = { findFirst: jest.fn(), findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'request' }) }
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    booking_passenger: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          Array.from({ length: 5 }, (_, index) => ({ id: `passenger-${index}`, passenger: { passport_number: `F03CSEED${index + 1}` } })),
        ),
    },
    booking_segment: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'segment' }) },
    booking_service_request: request,
  }
  const transaction = jest.fn((callback: (value: typeof tx) => unknown) => callback(tx))
  const db = {
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'customer' }) },
    staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff' }) },
    booking: { findFirst: jest.fn().mockResolvedValue({ id: 'booking', booking_reference: 'ABC123' }) },
    $transaction: transaction,
  }
  const assistance = { createForHold: jest.fn().mockResolvedValue(undefined), reviewRequest: jest.fn().mockResolvedValue(undefined) }
  const service = new AssistanceSeedService(db as unknown as DbService, assistance as unknown as AssistanceService, { now: () => now })
  beforeEach(() => {
    jest.clearAllMocks()
    request.findFirst.mockResolvedValue(null)
  })

  it('adds five validated requests and uses normal transitions for reviewed requests', async () => {
    await expect(service.seed()).resolves.toEqual({ reference: 'ABC123', created: 5 })
    expect(assistance.createForHold).toHaveBeenCalledTimes(5)
    expect(assistance.reviewRequest).toHaveBeenCalledWith(tx, 'request', 'staff', 'rejected', expect.any(String))
    expect(assistance.reviewRequest).toHaveBeenCalledWith(tx, 'request', 'staff', 'completed')
    const codes = assistance.createForHold.mock.calls.map((call: unknown[]) => (call[1] as Array<{ serviceCode: string }>)[0].serviceCode)
    expect(codes).not.toContain('STCR')
  })

  it('preserves existing requests and decisions on repeat runs', async () => {
    request.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(service.seed()).resolves.toEqual({ reference: 'ABC123', created: 0 })
    expect(assistance.createForHold).not.toHaveBeenCalled()
    expect(assistance.reviewRequest).not.toHaveBeenCalled()
  })

  it('refuses to seed production', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(service.seed()).rejects.toThrow('local development only')
      expect(transaction).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = previous
    }
  })
})
