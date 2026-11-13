import { BagMatchReviewService, SUPERSEDED_NOTE } from './bag-match-review.service'
import type { DbService } from '@backend/db/db.service'
import type { AuditActor, AuditService } from '@backend/modules/admin-console/audit/audit.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/admin-console/audit/audit.service', () => ({ AuditService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const BOOKING_PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const MATCH_ID = '88888888-8888-4888-8888-888888888888'
const OTHER_STAFF_ID = '99999999-9999-4999-8999-999999999999'
const ACTOR: AuditActor = { type: 'staff', id: '44444444-4444-4444-8444-444444444444', role: 'baggage' }
const SIM_NOW = new Date('2026-10-30T08:00:00Z')

/** list(): reviewed rows always; a pending suggestion only while its case is open or lost and its bag is still held. */
const ACTIONABLE_OR_REVIEWED = [
  { status: { notIn: ['suggested', 'under_review'] } },
  { lost_bag_report: { status: { in: ['open', 'lost'] } }, found_bag: { status: 'held' } },
]

function prismaError(code: string) {
  return Object.assign(new Error(code), { code })
}

/** What Prisma returns for a bag_match read with MATCH_INCLUDE. */
function matchRow(data: Record<string, unknown> = {}) {
  return {
    id: MATCH_ID,
    report_id: REPORT_ID,
    found_bag_id: FOUND_BAG_ID,
    match_level: 'strong',
    status: 'suggested',
    linked_by: null,
    reviewed_by: null,
    review_note: null,
    suggested_at: SIM_NOW,
    reviewed_at: null,
    created_at: SIM_NOW,
    updated_at: SIM_NOW,
    staff_bag_match_linked_byTostaff: null,
    staff_bag_match_reviewed_byTostaff: null,
    lost_bag_report: {
      id: REPORT_ID,
      case_number: 'LB-2026-000118',
      status: 'open',
      booking_passenger_id: BOOKING_PASSENGER_ID,
      flight_id: FLIGHT_ID,
      tag_number: '0789204511',
      bag_type: 'suitcase',
      colour: 'black',
      brand: 'Samsonite',
      description: 'Yellow strap around the middle',
      reported_at: SIM_NOW,
      reported_by_staff_id: null,
      passenger: { first_name: 'Lina', last_name: 'Haddad' },
      flight: { flight_number: 'FY117', service_date: SIM_NOW },
      booking_coupon: { booking_passenger: { booking: { booking_reference: 'H8LD3Q' } } },
    },
    found_bag: {
      id: FOUND_BAG_ID,
      status: 'held',
      tag_number: '0789204511',
      flight_id: FLIGHT_ID,
      bag_type: 'suitcase',
      colour: 'black',
      brand: 'Samsonite',
      description: 'Yellow strap',
      found_airport: 'BKK',
      found_at: SIM_NOW,
      flight: { flight_number: 'FY117' },
      checked_bag: { check_in: { booking_passenger_id: BOOKING_PASSENGER_ID } },
      bag_location_event: [{ airport_code: 'SIN' }],
    },
    ...data,
  }
}

function makeSvc() {
  const db = {
    bag_match: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(matchRow()),
      create: jest.fn().mockResolvedValue(matchRow({ match_level: 'manual' })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    lost_bag_report: {
      findUnique: jest.fn().mockResolvedValue({ status: 'open' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    found_bag: {
      findUnique: jest.fn().mockResolvedValue({ status: 'held' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    bag_delivery: { upsert: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockImplementation((_sql: TemplateStringsArray, id: string) => Promise.resolve([{ id, status: 'open' }])),
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const audit = { write: jest.fn().mockResolvedValue({ id: 'a-1', seq: '1' }) }
  const svc = new BagMatchReviewService(db as unknown as DbService, audit as unknown as AuditService, { now: () => SIM_NOW })

  return { svc, db, audit }
}

describe('BagMatchReviewService.getById', () => {
  it('returns both sides, the score and where the bag is now', async () => {
    const { svc } = makeSvc()

    const match = await svc.getById(MATCH_ID)

    expect(match).toMatchObject({
      id: MATCH_ID,
      level: 'strong',
      status: 'suggested',
      score: 100,
      report: { caseNumber: 'LB-2026-000118', passengerFirstName: 'Lina', bookingReference: 'H8LD3Q', flightNumber: 'FY117' },
      foundBag: { foundAirport: 'BKK', currentAirport: 'SIN', flightNumber: 'FY117' },
    })
    expect(match.reasons).toEqual(expect.arrayContaining(['same_tag', 'owner_tag', 'same_brand', 'similar_description']))
  })

  it('answers MATCH_NOT_FOUND for an unknown or malformed id', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findUnique.mockResolvedValue(null)

    await expect(svc.getById(MATCH_ID)).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' })
    await expect(svc.getById('nope')).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' })
  })
})

describe('BagMatchReviewService.list', () => {
  it('puts open matches first, strong on top, then confirmed, then rejected', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findMany.mockResolvedValue([
      matchRow({ id: 'a1', status: 'rejected' }),
      matchRow({ id: 'a2', status: 'confirmed' }),
      matchRow({ id: 'a3', match_level: 'possible' }),
      matchRow({ id: 'a4', match_level: 'manual', status: 'under_review' }),
      matchRow({ id: 'a5' }),
    ])

    const ids = (await svc.list()).map((m) => m.id)

    expect(ids).toEqual(['a5', 'a3', 'a4', 'a2', 'a1'])
  })

  it('filters by status, case and bag, and returns nothing for a malformed id', async () => {
    const { svc, db } = makeSvc()

    await svc.list({ status: 'suggested', reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })

    expect(db.bag_match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'suggested', report_id: REPORT_ID, found_bag_id: FOUND_BAG_ID, OR: ACTIONABLE_OR_REVIEWED },
      }),
    )
    expect(await svc.list({ reportId: 'nope' })).toEqual([])
  })

  it.each([
    ['no filter', {}],
    ['a status filter', { status: 'under_review' as const }],
    ['a case filter', { reportId: REPORT_ID }],
    ['a bag filter', { foundBagId: FOUND_BAG_ID }],
  ])('offers pending suggestions only while their case can be matched, with %s', async (_label, filter) => {
    const { svc, db } = makeSvc()

    await svc.list(filter)

    const where = db.bag_match.findMany.mock.calls[0][0].where
    expect(where.OR).toEqual(ACTIONABLE_OR_REVIEWED)
  })

  it('keeps reviewed history but leaves out pending suggestions on cancelled, closed or matched cases and on bags no longer held', async () => {
    const { svc, db } = makeSvc()
    const rows = [
      matchRow({ id: 'pending-open' }),
      matchRow({ id: 'pending-lost', lost_bag_report: { ...matchRow().lost_bag_report, status: 'lost' } }),
      matchRow({ id: 'pending-cancelled', lost_bag_report: { ...matchRow().lost_bag_report, status: 'cancelled' } }),
      matchRow({ id: 'pending-closed', status: 'under_review', lost_bag_report: { ...matchRow().lost_bag_report, status: 'closed' } }),
      matchRow({ id: 'pending-matched', lost_bag_report: { ...matchRow().lost_bag_report, status: 'matched' } }),
      matchRow({ id: 'confirmed-cancelled', status: 'confirmed', lost_bag_report: { ...matchRow().lost_bag_report, status: 'cancelled' } }),
      matchRow({ id: 'rejected-cancelled', status: 'rejected', lost_bag_report: { ...matchRow().lost_bag_report, status: 'cancelled' } }),
      matchRow({ id: 'pending-unclaimed-bag', found_bag: { ...matchRow().found_bag, status: 'unclaimed' } }),
      matchRow({ id: 'pending-continued-bag', found_bag: { ...matchRow().found_bag, status: 'continued_with_flight' } }),
      matchRow({ id: 'rejected-unclaimed-bag', status: 'rejected', found_bag: { ...matchRow().found_bag, status: 'unclaimed' } }),
    ]
    // Evaluate the where clause the service builds against the rows, as the database would.
    type Clause = { status?: { notIn: string[] }; lost_bag_report?: { status: { in: string[] } }; found_bag?: { status: string } }
    const holds = (clause: Clause, row: (typeof rows)[number]) =>
      clause.status
        ? !clause.status.notIn.includes(row.status)
        : (clause.lost_bag_report?.status.in.includes(row.lost_bag_report.status) ?? false) &&
          (clause.found_bag === undefined || clause.found_bag.status === row.found_bag.status)
    db.bag_match.findMany.mockImplementation(({ where }: { where: { OR: Clause[] } }) =>
      Promise.resolve(rows.filter((row) => where.OR.some((clause) => holds(clause, row)))),
    )

    const ids = (await svc.list()).map((m) => m.id).sort()

    expect(ids).toEqual(['confirmed-cancelled', 'pending-lost', 'pending-open', 'rejected-cancelled', 'rejected-unclaimed-bag'])
  })
})

describe('BagMatchReviewService.link', () => {
  it('writes the link to audit_log in the same transaction', async () => {
    const { svc, db, audit } = makeSvc()

    await svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        action: 'create',
        entityType: 'bag_match',
        after: expect.objectContaining({ level: 'manual', reportId: REPORT_ID, foundBagId: FOUND_BAG_ID, staffId: STAFF_ID }),
      }),
      db,
    )
  })

  it('adds a manual match linked by the staff member', async () => {
    const { svc, db } = makeSvc()

    const match = await svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })

    expect(db.bag_match.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ match_level: 'manual', status: 'suggested', linked_by: STAFF_ID, suggested_at: SIM_NOW }),
      }),
    )
    expect(match.level).toBe('manual')
  })

  it('refuses a case that already has its bag, and a bag that is not held', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findUnique.mockResolvedValueOnce({ status: 'matched' })
    await expect(svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })

    db.found_bag.findUnique.mockResolvedValueOnce({ status: 'unclaimed' })
    await expect(svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })

  it('answers MATCH_EXISTS when the pair is already matched', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.create.mockRejectedValue(prismaError('P2002'))

    await expect(svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_EXISTS',
    })
  })

  it('answers not found for a missing case or bag', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findUnique.mockResolvedValueOnce(null)
    await expect(svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })

    db.found_bag.findUnique.mockResolvedValueOnce(null)
    await expect(svc.link({ staffId: STAFF_ID, actor: ACTOR, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'FOUND_BAG_NOT_FOUND',
    })
  })
})

describe('BagMatchReviewService.confirm', () => {
  it('confirms, rejects the other open matches, marks both matched and opens the delivery', async () => {
    const { svc, db } = makeSvc()

    await svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: ' Tag and strap match ' })

    expect(db.bag_match.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: MATCH_ID, status: { in: ['suggested', 'under_review'] } },
      data: expect.objectContaining({
        status: 'confirmed',
        reviewed_by: STAFF_ID,
        reviewed_at: SIM_NOW,
        review_note: 'Tag and strap match',
      }),
    })
    expect(db.bag_match.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { not: MATCH_ID },
        status: { in: ['suggested', 'under_review'] },
        OR: [{ report_id: REPORT_ID }, { found_bag_id: FOUND_BAG_ID }],
      },
      data: expect.objectContaining({ status: 'rejected', reviewed_by: STAFF_ID, review_note: SUPERSEDED_NOTE }),
    })
    expect(db.lost_bag_report.updateMany).toHaveBeenCalledWith({
      where: { id: REPORT_ID, status: { in: ['open', 'lost'] } },
      data: expect.objectContaining({ status: 'matched' }),
    })
    expect(db.found_bag.updateMany).toHaveBeenCalledWith({
      where: { id: FOUND_BAG_ID, status: 'held' },
      data: expect.objectContaining({ status: 'matched' }),
    })
    expect(db.bag_delivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { report_id: REPORT_ID }, create: expect.objectContaining({ status: 'waiting_choice' }) }),
    )
  })

  it('locks the case, then the bag, before changing anything', async () => {
    const { svc, db } = makeSvc()

    await svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'Tag matches' })

    expect(
      db.$queryRaw.mock.calls.map(([sql, id]: [TemplateStringsArray, string]) => [sql.join('?').match(/FROM (\w+)/)?.[1], id]),
    ).toEqual([
      ['lost_bag_report', REPORT_ID],
      ['found_bag', FOUND_BAG_ID],
    ])
    expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(db.bag_match.updateMany.mock.invocationCallOrder[0])
  })

  it('writes the review to audit_log in the same transaction', async () => {
    const { svc, db, audit } = makeSvc()

    await svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'Tag matches' })

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        action: 'status_change',
        entityType: 'bag_match',
        entityId: MATCH_ID,
        reason: 'Tag matches',
        after: expect.objectContaining({ status: 'confirmed', staffId: STAFF_ID }),
      }),
      db,
    )
  })

  it('does not let the staff member who linked a match confirm it', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findUnique.mockResolvedValue(matchRow({ match_level: 'manual', linked_by: STAFF_ID }))

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
      code: 'SELF_CONFIRM',
      status: 403,
    })
    expect(db.$transaction).not.toHaveBeenCalled()

    db.bag_match.findUnique.mockResolvedValue(matchRow({ match_level: 'manual', linked_by: OTHER_STAFF_ID }))
    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).resolves.toBeDefined()
  })

  it('needs a note', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: '  ' })).rejects.toMatchObject({
      code: 'INVALID_MATCH',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a match that was already reviewed', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findUnique.mockResolvedValue({ id: MATCH_ID, status: 'rejected', report_id: REPORT_ID, found_bag_id: FOUND_BAG_ID })

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })

  it('rolls back when the case is no longer open', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
    expect(db.found_bag.updateMany).not.toHaveBeenCalled()
  })

  it('rolls back when the bag is no longer held', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
    expect(db.bag_delivery.upsert).not.toHaveBeenCalled()
  })

  it.each(['cancelled', 'closed', 'matched', 'delivering'])(
    'refuses a stale suggestion whose case is now %s, before locking the bag or writing anything',
    async (status) => {
      const { svc, db, audit } = makeSvc()
      db.$queryRaw.mockImplementation((_sql: TemplateStringsArray, id: string) => Promise.resolve([{ id, status }]))

      await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
        code: 'MATCH_CLOSED',
      })
      expect(db.$queryRaw).toHaveBeenCalledTimes(1) // the case lock only; the bag is never locked
      expect(db.bag_match.updateMany).not.toHaveBeenCalled()
      expect(db.lost_bag_report.updateMany).not.toHaveBeenCalled()
      expect(db.found_bag.updateMany).not.toHaveBeenCalled()
      expect(db.bag_delivery.upsert).not.toHaveBeenCalled()
      expect(audit.write).not.toHaveBeenCalled()
    },
  )

  it('answers MATCH_CLOSED when another match of the case or bag was confirmed at the same time', async () => {
    const { svc, db } = makeSvc()
    db.$transaction.mockRejectedValue(prismaError('P2002'))

    await expect(svc.confirm({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })
})

describe('BagMatchReviewService.reject', () => {
  it('rejects with an optional note and leaves the case and bag alone', async () => {
    const { svc, db, audit } = makeSvc()

    await svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID })

    expect(db.bag_match.updateMany).toHaveBeenCalledWith({
      where: { id: MATCH_ID, status: { in: ['suggested', 'under_review'] } },
      data: expect.objectContaining({ status: 'rejected', reviewed_by: STAFF_ID, reviewed_at: SIM_NOW, review_note: null }),
    })
    expect(db.lost_bag_report.updateMany).not.toHaveBeenCalled()
    expect(db.found_bag.updateMany).not.toHaveBeenCalled()
    expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ after: expect.objectContaining({ status: 'rejected' }) }), db)
  })

  it('answers MATCH_CLOSED when someone reviewed it first', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'Different strap' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })

  it('locks the case row before recording the rejection', async () => {
    const { svc, db } = makeSvc()

    await svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID })

    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
    const [sql, id] = db.$queryRaw.mock.calls[0] as [TemplateStringsArray, string]
    expect(sql.join('?')).toMatch(/FROM lost_bag_report[\s\S]*FOR UPDATE/)
    expect(id).toBe(REPORT_ID)
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.bag_match.updateMany.mock.invocationCallOrder[0])
  })

  it.each(['open', 'lost'])('rejects a suggestion on a %s case', async (status) => {
    const { svc, db } = makeSvc()
    db.$queryRaw.mockImplementation((_sql: TemplateStringsArray, id: string) => Promise.resolve([{ id, status }]))

    await expect(svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID })).resolves.toBeDefined()
    expect(db.bag_match.updateMany).toHaveBeenCalledTimes(1)
  })

  it.each(['cancelled', 'closed', 'matched', 'delivering'])(
    'does not record a "not the same bag" decision on a stale suggestion whose case is %s',
    async (status) => {
      const { svc, db, audit } = makeSvc()
      db.$queryRaw.mockImplementation((_sql: TemplateStringsArray, id: string) => Promise.resolve([{ id, status }]))

      await expect(svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID, note: 'Different' })).rejects.toMatchObject({
        code: 'MATCH_CLOSED',
      })
      expect(db.bag_match.updateMany).not.toHaveBeenCalled()
      expect(audit.write).not.toHaveBeenCalled()
    },
  )

  it('answers MATCH_NOT_FOUND when the case row has gone', async () => {
    const { svc, db, audit } = makeSvc()
    db.$queryRaw.mockResolvedValue([])

    await expect(svc.reject({ staffId: STAFF_ID, actor: ACTOR, matchId: MATCH_ID })).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' })
    expect(db.bag_match.updateMany).not.toHaveBeenCalled()
    expect(audit.write).not.toHaveBeenCalled()
  })
})
