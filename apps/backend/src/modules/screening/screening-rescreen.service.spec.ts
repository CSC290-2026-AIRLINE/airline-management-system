import type { Prisma } from '@backend/db/generated/prisma/client'
import { ScreeningCheckService } from './screening-check.service'
import { StubBookingsPort, ScreeningRescreenService } from './screening-rescreen.service'
import { now, passengerId, flightId } from './screening.test-fixtures'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('Automatic re-screening booking source', () => {
  const tx = {} as Prisma.TransactionClient
  const bookings = { listUpcomingPassengerFlights: jest.fn() }
  const checks = { checkSystemInTransaction: jest.fn() }
  const pair = { passengerId, flightId }
  const service = new ScreeningRescreenService(bookings, checks as unknown as ScreeningCheckService)
  beforeEach(() => {
    jest.resetAllMocks()
    bookings.listUpcomingPassengerFlights.mockResolvedValue([pair, pair, { ...pair, passengerId: 'another-passenger' }])
  })
  it.each(['new_entry', 'entry_change'] as const)(
    'checks every upcoming pair on %s without requiring screening history',
    async (trigger) => {
      const result = await service.run(tx, now, 'watchlist', trigger, undefined, 'entry-id')
      expect(bookings.listUpcomingPassengerFlights).toHaveBeenCalledWith(tx, now)
      expect(checks.checkSystemInTransaction).toHaveBeenCalledTimes(2)
      expect(checks.checkSystemInTransaction).toHaveBeenCalledWith(tx, now, 'watchlist', { ...pair, triggerPoint: trigger }, 'entry-id')
      expect(result).toEqual({ runs: 2, bookingSource: 'connected' })
    },
  )
  it('checks only the changed passenger and retains the booking reference', async () => {
    bookings.listUpcomingPassengerFlights.mockResolvedValue([
      { ...pair, pnrId: 'booking-id' },
      { ...pair, passengerId: 'other' },
    ])
    await service.run(tx, now, 'saved_passenger', 'identity_change', passengerId)
    expect(checks.checkSystemInTransaction).toHaveBeenCalledTimes(1)
    expect(checks.checkSystemInTransaction).toHaveBeenCalledWith(
      tx,
      now,
      'saved_passenger',
      { ...pair, pnrId: 'booking-id', triggerPoint: 'identity_change' },
      undefined,
    )
  })
  it('does not exclude checked-in pairs supplied by F3b', async () => {
    // The port deliberately has no not-checked-in filter. F3b supplies both pairs.
    bookings.listUpcomingPassengerFlights.mockResolvedValue([pair, { ...pair, flightId: 'checked-in-upcoming-flight' }])
    await service.run(tx, now, 'customer_profile', 'identity_change', passengerId)
    expect(checks.checkSystemInTransaction).toHaveBeenCalledTimes(2)
  })
  it('propagates failures to the enclosing write transaction', async () => {
    checks.checkSystemInTransaction.mockRejectedValueOnce(new Error('check failed'))
    await expect(service.run(tx, now, 'watchlist', 'entry_change')).rejects.toThrow('check failed')
  })
  it('reports the empty stub honestly without inventing bookings from screening history', async () => {
    const stub = new ScreeningRescreenService(new StubBookingsPort(), checks as unknown as ScreeningCheckService)
    expect(await stub.run(tx, now, 'watchlist', 'new_entry')).toEqual({ runs: 0, bookingSource: 'stub' })
    expect(checks.checkSystemInTransaction).not.toHaveBeenCalled()
  })
})
