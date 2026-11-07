import { MAX_NOTIFICATIONS, StaffNotificationService } from './staff-notification.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const SIM_NOW = new Date('2026-10-30T08:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): Date {
  return new Date(SIM_NOW.getTime() - days * DAY_MS)
}

function makeSvc() {
  const db = {
    bag_match: { findMany: jest.fn().mockResolvedValue([]) },
    lost_bag_report: { findMany: jest.fn().mockResolvedValue([]) },
    bag_delivery: { findMany: jest.fn().mockResolvedValue([]) },
    found_bag: { findMany: jest.fn().mockResolvedValue([]) },
    baggage_setting: { findUnique: jest.fn().mockResolvedValue({ value: '90' }) },
  }
  const svc = new StaffNotificationService(db as unknown as DbService, { now: () => SIM_NOW })
  return { svc, db }
}

describe('StaffNotificationService', () => {
  it('builds one notification per row, newest first, with stable ids', async () => {
    const { svc, db } = makeSvc()
    db.bag_match.findMany.mockResolvedValue([
      {
        id: 'match-1',
        suggested_at: daysAgo(1),
        found_bag_id: 'bag-1',
        lost_bag_report: { case_number: 'LB-2026-000118' },
        found_bag: { found_airport: 'BKK' },
      },
    ])
    db.lost_bag_report.findMany
      .mockResolvedValueOnce([
        { id: 'report-1', case_number: 'LB-2026-000119', reported_at: daysAgo(0.5), passenger: { first_name: 'Tom', last_name: 'Becker' } },
      ])
      .mockResolvedValueOnce([
        { id: 'report-2', case_number: 'LB-2026-000100', lost_at: daysAgo(3), passenger: { first_name: 'Ana', last_name: 'Lee' } },
      ])
    db.bag_delivery.findMany.mockResolvedValue([
      { report_id: 'report-3', delivery_type: 'hotel', updated_at: daysAgo(2), lost_bag_report: { case_number: 'LB-2026-000120' } },
    ])

    const feed = await svc.feed()

    expect(feed.generatedAt).toEqual(SIM_NOW)
    expect(feed.items.map((n) => n.id)).toEqual([
      'new_report:report-1',
      'strong_match:match-1',
      'delivery_to_send:report-3',
      'case_lost:report-2',
    ])
    expect(feed.items[0]).toMatchObject({ kind: 'new_report', caseNumber: 'LB-2026-000119', passengerName: 'Tom Becker' })
    expect(feed.items[2]).toMatchObject({ kind: 'delivery_to_send', deliveryType: 'hotel' })
  })

  it('only lists open strong matches and passenger reports from the last 14 days', async () => {
    const { svc, db } = makeSvc()

    await svc.feed()

    expect(db.bag_match.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { match_level: 'strong', status: { in: ['suggested', 'under_review'] } } }),
    )
    expect(db.lost_bag_report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'open', reported_by_staff_id: null, reported_at: { gte: daysAgo(14) } } }),
    )
  })

  it('warns a week before a held bag turns unclaimed', async () => {
    const { svc, db } = makeSvc()
    db.baggage_setting.findUnique.mockResolvedValue({ value: '30' })
    db.found_bag.findMany.mockResolvedValueOnce([{ id: 'bag-1', found_airport: 'CNX', found_at: daysAgo(25) }]).mockResolvedValueOnce([])

    const feed = await svc.feed()

    expect(db.found_bag.findMany.mock.calls[0][0].where).toMatchObject({ status: 'held', found_at: { lte: daysAgo(23) } })
    expect(feed.items).toEqual([
      expect.objectContaining({
        id: 'unclaimed_soon:bag-1',
        foundBagId: 'bag-1',
        airportCode: 'CNX',
        occurredAt: daysAgo(2),
        dueAt: daysAgo(-5),
      }),
    ])
  })

  it('falls back to 90 days when the setting is not valid', async () => {
    const { svc, db } = makeSvc()
    db.baggage_setting.findUnique.mockResolvedValue({ value: 'soon' })

    await svc.feed()

    expect(db.found_bag.findMany.mock.calls[0][0].where.found_at).toEqual({ lte: daysAgo(83) })
  })

  it(`keeps at most ${MAX_NOTIFICATIONS}`, async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(Array.from({ length: 60 }, (_, i) => ({ id: `bag-${i}`, found_airport: 'BKK', updated_at: daysAgo(i / 10) })))

    const feed = await svc.feed()

    expect(feed.items).toHaveLength(MAX_NOTIFICATIONS)
    expect(feed.items[0].id).toBe('bag_unclaimed:bag-0')
  })
})
