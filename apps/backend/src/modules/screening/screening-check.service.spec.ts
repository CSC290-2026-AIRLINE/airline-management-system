import { BadRequestException, ConflictException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { ScreeningAudit, ScreeningContext } from './screening.context'
import { ScreeningCheckService } from './screening-check.service'
import {
  checkFixture,
  entryFixture,
  passengerFixture,
  reviewFixture,
  now,
  checkId,
  passengerId,
  flightId,
  staffId,
  userId,
} from './screening.test-fixtures'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('ScreeningCheckService', () => {
  const tx = {
    staff: { findFirst: jest.fn() },
    passenger: { findFirst: jest.fn() },
    flight: { findUnique: jest.fn() },
    screening_check: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), createManyAndReturn: jest.fn() },
    audit_log: { create: jest.fn() },
    $queryRaw: jest.fn(),
  }
  const db = { $transaction: jest.fn() }
  const matcher = { match: jest.fn() }
  const input = { passengerId, flightId, triggerPoint: 'check_in' as const }
  let service: ScreeningCheckService
  beforeEach(() => {
    jest.resetAllMocks()
    tx.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'security' } })
    db.$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback(tx))
    tx.passenger.findFirst.mockResolvedValue(passengerFixture())
    tx.flight.findUnique.mockResolvedValue({ id: flightId, dep_at: new Date(now.getTime() + 3600000), status: 'scheduled' })
    tx.screening_check.findMany.mockResolvedValue([])
    tx.screening_check.create.mockResolvedValue(checkFixture({ outcome: 'clear' }))
    tx.screening_check.createManyAndReturn.mockResolvedValue([{ id: checkId }])
    tx.$queryRaw.mockResolvedValue([])
    matcher.match.mockResolvedValue([])
    service = new ScreeningCheckService(new ScreeningContext(db as unknown as DbService, { now: () => now }), matcher, new ScreeningAudit())
  })
  it('stores both snapshots and the matcher score in the same insert, and returns held for a held check', async () => {
    matcher.match.mockResolvedValue([{ entry: entryFixture(), similarity: 0.8, level: 'probable', reason: 'name_and_dob' }])
    tx.screening_check.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...checkFixture(), screening_review: [] }])
    const result = await service.check(userId, input)
    expect(result.outcome).toBe('held')
    expect(tx.screening_check.createManyAndReturn.mock.calls[0][0].data[0]).toMatchObject({
      passenger_id: passengerId,
      watchlist_entry_id: entryFixture().id,
      name_similarity: 0.8,
      snap_first_name: passengerFixture().first_name,
      snap_passport: passengerFixture().passport_number,
      snap_entry_first_name: entryFixture().first_name,
      snap_entry_passport: entryFixture().passport_number,
      outcome: 'held',
    })
  })
  it('writes a clean run without entry snapshots when no entry matches', async () => {
    await service.check(userId, input)
    const data = tx.screening_check.create.mock.calls[0][0].data
    expect(data).toMatchObject({ outcome: 'clear', match_level: 'none' })
    expect(data).not.toHaveProperty('snap_entry_first_name')
    expect(data).not.toHaveProperty('name_similarity')
  })
  it('does not duplicate an existing stable hit on retry', async () => {
    matcher.match.mockResolvedValue([{ entry: entryFixture(), similarity: 0.8, level: 'probable' }])
    tx.screening_check.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([checkFixture()])
    expect((await service.check(userId, input)).reusedCheckIds).toEqual([checkId])
    expect(tx.screening_check.createManyAndReturn).not.toHaveBeenCalled()
  })
  it('requires identity_change instead of silently reusing a stale identity snapshot', async () => {
    matcher.match.mockResolvedValue([{ entry: entryFixture(), similarity: 0.8, level: 'probable' }])
    tx.screening_check.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([checkFixture({ snap_passport: 'OLD' })])
    await expect(service.check(userId, input)).rejects.toBeInstanceOf(ConflictException)
  })
  it('remembers false positives across passenger copies and does not recreate the hit', async () => {
    const history = [{ ...checkFixture({ passenger_id: 'copy' }), screening_review: [reviewFixture()] }]
    tx.screening_check.findMany.mockResolvedValue(history)
    matcher.match.mockResolvedValue([{ entry: entryFixture(), similarity: 0.8, level: 'probable' }])
    const result = await service.check(userId, input)
    expect(result.skippedEntryIds).toEqual([entryFixture().id])
    expect(result.outcome).toBe('clear')
    expect(tx.screening_check.createManyAndReturn).not.toHaveBeenCalled()
  })
  it('uses the latest revision to keep confirmed matches denied', async () => {
    tx.screening_check.findMany.mockResolvedValue([
      { ...checkFixture(), screening_review: [reviewFixture({ decision: 'confirmed', revision: 2 })] },
    ])
    expect((await service.check(userId, input)).outcome).toBe('denied')
  })
  it('rejects missing nationality and departed flights before creating checks', async () => {
    tx.passenger.findFirst.mockResolvedValue(passengerFixture({ nationality: null }))
    await expect(service.check(userId, input)).rejects.toBeInstanceOf(BadRequestException)
    tx.passenger.findFirst.mockResolvedValue(passengerFixture())
    tx.flight.findUnique.mockResolvedValue({ id: flightId, dep_at: now, status: 'scheduled' })
    await expect(service.check(userId, input)).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.screening_check.create).not.toHaveBeenCalled()
  })
  it('does not grant clearance without a stored screening', async () => {
    expect((await service.status(userId, passengerId, flightId)).outcome).toBe('not_screened')
  })
})
