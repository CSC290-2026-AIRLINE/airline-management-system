import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { ScreeningAudit, ScreeningContext } from './screening.context'
import { ScreeningService } from './screening.service'
import { MockScreeningBooking, MockScreeningNotification } from './screening.ports'
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
  const body = { decision: 'false_positive' as const, note: 'Compared in person', passportCompared: true as const, expectedRevision: 0 }
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
      new MockScreeningNotification(),
    )
  })
  it('inserts revision 1 and records passport acknowledgement in audit without copying identity or note', async () => {
    const result = await service.review(userId, checkId, body)
    expect(result.review.revision).toBe(1)
    expect(tx.screening_review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          screening_check_id: checkId,
          revision: 1,
          reviewed_by_staff_id: staffId,
          review_note: body.note,
          authority_notified_at: null,
        }),
      }),
    )
    expect(tx.audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after: expect.objectContaining({ passportCompared: true, revision: 1 }),
          actor_id: userId,
        }),
      }),
    )
    const audit = JSON.stringify(tx.audit_log.create.mock.calls)
    expect(audit).not.toContain(checkFixture().snap_passport)
    expect(audit).not.toContain(body.note)
  })
  it('appends a correction to the same check and labels a confirmation notification as mock', async () => {
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture(), screening_review: [reviewFixture({ revision: 3 })] })
    tx.screening_review.create.mockResolvedValue({
      ...reviewFixture({ revision: 4, decision: 'confirmed', authority_notified_at: now }),
      staff,
    })
    const result = await service.review(userId, checkId, { ...body, expectedRevision: 3, decision: 'confirmed' })
    expect(result.review).toMatchObject({ revision: 4, notificationMode: 'mock' })
    expect(tx.screening_review.create.mock.calls[0][0].data).toMatchObject({ revision: 4, authority_notified_at: now })
    expect(result.integrations.checkIn).toBe('not_connected')
  })
  it('rejects stale revisions before writing', async () => {
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture(), screening_review: [reviewFixture()] })
    await expect(service.review(userId, checkId, body)).rejects.toBeInstanceOf(ConflictException)
    expect(tx.screening_review.create).not.toHaveBeenCalled()
  })
  it('maps a concurrent insert collision to a conflict', async () => {
    tx.screening_review.create.mockRejectedValue({ code: 'P2002' })
    await expect(service.review(userId, checkId, body)).rejects.toBeInstanceOf(ConflictException)
  })
  it('rejects clean, missing and future checks', async () => {
    tx.screening_check.findUnique.mockResolvedValue(null)
    await expect(service.review(userId, checkId, body)).rejects.toBeInstanceOf(NotFoundException)
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture({ outcome: 'clear' }), screening_review: [] })
    await expect(service.review(userId, checkId, body)).rejects.toBeInstanceOf(BadRequestException)
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture({ occurred_at: new Date(now.getTime() + 1) }), screening_review: [] })
    await expect(service.review(userId, checkId, body)).rejects.toBeInstanceOf(BadRequestException)
  })
  it('keeps another held match blocked after this review', async () => {
    tx.screening_check.findMany.mockResolvedValue([
      { ...checkFixture(), screening_review: [reviewFixture()] },
      { ...checkFixture({ id: 'other', watchlist_entry_id: 'other' }), screening_review: [] },
    ])
    expect((await service.review(userId, checkId, body)).clearance).toBe('held')
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
  it('does not succeed if the audit insert fails', async () => {
    tx.audit_log.create.mockRejectedValue(new Error('offline'))
    await expect(service.review(userId, checkId, body)).rejects.toThrow('could not be completed')
  })
})
