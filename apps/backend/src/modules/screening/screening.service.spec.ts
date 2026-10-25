import { BadRequestException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { ScreeningAudit, ScreeningContext } from './screening.context'
import { ScreeningService } from './screening.service'
import { MockScreeningBooking } from './screening.ports'
import { QueueDto } from './dto/screening.dto'
import { checkFixture, reviewFixture, now, checkId, staffId, userId } from './screening.test-fixtures'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('ScreeningService', () => {
  const tx = {
    staff: { findFirst: jest.fn() },
    screening_check: { findUnique: jest.fn(), findMany: jest.fn() },
    screening_review: { create: jest.fn() },
    audit_log: { create: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  }
  const db = { $transaction: jest.fn() }
  const staff = { first_name: 'Nida', last_name: 'P' }
  const flight = {
    id: 'flight',
    flight_number: 'FD 330',
    dep_at: new Date(now.getTime() + 3600000),
    status: 'scheduled',
    route: { origin: 'BKK', destination: 'RGN' },
  }
  let service: ScreeningService
  beforeEach(() => {
    jest.resetAllMocks()
    tx.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'security' } })
    db.$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback(tx))
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture(), flight, screening_review: [], watchlist_entry: null })
    tx.screening_check.findMany.mockResolvedValue([])
    tx.screening_review.create.mockResolvedValue({ ...reviewFixture(), staff })
    tx.audit_log.findMany.mockResolvedValue([])
    tx.$queryRaw.mockResolvedValue([])
    service = new ScreeningService(
      new ScreeningContext(db as unknown as DbService, { now: () => now }),
      new ScreeningAudit(),
      new MockScreeningBooking(),
    )
  })
  it('serves immutable identity snapshots and all revisions without reading the current passenger', async () => {
    const reviews = [
      { ...reviewFixture({ revision: 2 }), staff },
      { ...reviewFixture(), staff },
    ]
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture(), flight, screening_review: reviews, watchlist_entry: null })
    const result = await service.detail(userId, checkId)
    expect(result.snapshot.passenger).toMatchObject({ firstName: 'MAYA', passportNumber: checkFixture().snap_passport })
    expect(result.reviews.map((r) => r.revision)).toEqual([2, 1])
    expect(result.latestReview?.passportComparisonEvidence).toBe('not_available')
    expect(result.booking.source).toBe('not_connected')
  })
  it('loads passport comparison evidence from the append-only audit instead of inventing it for old reviews', async () => {
    tx.screening_check.findUnique.mockResolvedValue({
      ...checkFixture(),
      flight,
      screening_review: [{ ...reviewFixture(), staff }],
      watchlist_entry: null,
    })
    tx.audit_log.findMany.mockResolvedValue([{ entity_id: reviewFixture().id, after: { passportCompared: true } }])
    const result = await service.detail(userId, checkId)
    expect(result.latestReview).toMatchObject({ passportCompared: true, passportComparisonEvidence: 'audit' })
  })
  it('paginates without full passports and binds search as data', async () => {
    const page = { id: checkId, rank: 0, primary_at: flight.dep_at, dep_at: flight.dep_at }
    tx.$queryRaw.mockResolvedValueOnce([page, { ...page, id: 'other' }]).mockResolvedValueOnce([{ held: 2, flagged: 1, decided: 5 }])
    tx.screening_check.findMany.mockResolvedValue([{ ...checkFixture(), flight, screening_review: [] }])
    const result = await service.list(userId, Object.assign(new QueueDto(), { limit: 1, q: "MAYA' OR 1=1 --" }))
    expect(result.nextCursor).toBeTruthy()
    expect(result.counts).toEqual({ needsReview: 3, held: 2, flagged: 1, decided: 5 })
    expect(JSON.stringify(result.items)).not.toContain(checkFixture().snap_passport)
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toContain("MAYA' OR 1=1 --")
    await expect(
      service.list(userId, Object.assign(new QueueDto(), { cursor: result.nextCursor, status: 'decided' })),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
