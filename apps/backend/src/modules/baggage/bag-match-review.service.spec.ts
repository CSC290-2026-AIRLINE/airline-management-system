import { BagMatchReviewService, SUPERSEDED_NOTE } from './bag-match-review.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const BOOKING_PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const MATCH_ID = '88888888-8888-4888-8888-888888888888'
const SIM_NOW = new Date('2026-10-30T08:00:00Z')

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
  const svc = new BagMatchReviewService(db as unknown as DbService, { now: () => SIM_NOW })

  return { svc, db }
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
      expect.objectContaining({ where: { status: 'suggested', report_id: REPORT_ID, found_bag_id: FOUND_BAG_ID } }),
    )
    expect(await svc.list({ reportId: 'nope' })).toEqual([])
  })
})

describe('BagMatchReviewService.link', () => {
  it('adds a manual match linked by the staff member', async () => {
    const { svc, db } = makeSvc()

    const match = await svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })

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
    await expect(svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })

    db.found_bag.findUnique.mockResolvedValueOnce({ status: 'unclaimed' })
    await expect(svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })

  it('answers MATCH_EXISTS when the pair is already matched', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.create.mockRejectedValue(prismaError('P2002'))

    await expect(svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'MATCH_EXISTS',
    })
  })

  it('answers not found for a missing case or bag', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findUnique.mockResolvedValueOnce(null)
    await expect(svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'REPORT_NOT_FOUND',
    })

    db.found_bag.findUnique.mockResolvedValueOnce(null)
    await expect(svc.link({ staffId: STAFF_ID, reportId: REPORT_ID, foundBagId: FOUND_BAG_ID })).rejects.toMatchObject({
      code: 'FOUND_BAG_NOT_FOUND',
    })
  })
})

describe('BagMatchReviewService.confirm', () => {
  it('confirms, rejects the other open matches, marks both matched and opens the delivery', async () => {
    const { svc, db } = makeSvc()

    await svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: ' Tag and strap match ' })

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

    await svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'Tag matches' })

    expect(
      db.$queryRaw.mock.calls.map(([sql, id]: [TemplateStringsArray, string]) => [sql.join('?').match(/FROM (\w+)/)?.[1], id]),
    ).toEqual([
      ['lost_bag_report', REPORT_ID],
      ['found_bag', FOUND_BAG_ID],
    ])
    expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(db.bag_match.updateMany.mock.invocationCallOrder[0])
  })

  it('needs a note', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: '  ' })).rejects.toMatchObject({ code: 'INVALID_MATCH' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a match that was already reviewed', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findUnique.mockResolvedValue({ id: MATCH_ID, status: 'rejected', report_id: REPORT_ID, found_bag_id: FOUND_BAG_ID })

    await expect(svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
  })

  it('rolls back when the case is no longer open', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
    expect(db.found_bag.updateMany).not.toHaveBeenCalled()
  })

  it('rolls back when the bag is no longer held', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
    expect(db.bag_delivery.upsert).not.toHaveBeenCalled()
  })

  it('answers MATCH_CLOSED when another match of the case or bag was confirmed at the same time', async () => {
    const { svc, db } = makeSvc()
    db.$transaction.mockRejectedValue(prismaError('P2002'))

    await expect(svc.confirm({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'ok' })).rejects.toMatchObject({ code: 'MATCH_CLOSED' })
  })
})

describe('BagMatchReviewService.reject', () => {
  it('rejects with an optional note and leaves the case and bag alone', async () => {
    const { svc, db } = makeSvc()

    await svc.reject({ staffId: STAFF_ID, matchId: MATCH_ID })

    expect(db.bag_match.updateMany).toHaveBeenCalledWith({
      where: { id: MATCH_ID, status: { in: ['suggested', 'under_review'] } },
      data: expect.objectContaining({ status: 'rejected', reviewed_by: STAFF_ID, reviewed_at: SIM_NOW, review_note: null }),
    })
    expect(db.lost_bag_report.updateMany).not.toHaveBeenCalled()
    expect(db.found_bag.updateMany).not.toHaveBeenCalled()
  })

  it('answers MATCH_CLOSED when someone reviewed it first', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.updateMany.mockResolvedValue({ count: 0 })

    await expect(svc.reject({ staffId: STAFF_ID, matchId: MATCH_ID, note: 'Different strap' })).rejects.toMatchObject({
      code: 'MATCH_CLOSED',
    })
  })
})
