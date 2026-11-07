import { BagMatchingService } from './bag-matching.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_FLIGHT_ID = '33333333-3333-4333-8333-333333333333'
const BOOKING_PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const REPORT_ID = '77777777-7777-4777-8777-777777777777'
const OTHER_REPORT_ID = '88888888-8888-4888-8888-888888888888'
const SIM_NOW = new Date('2026-10-30T08:00:00Z')

function bagRow(data: Record<string, unknown> = {}) {
  return {
    id: FOUND_BAG_ID,
    status: 'held',
    tag_number: '0789204511',
    flight_id: FLIGHT_ID,
    bag_type: 'suitcase',
    colour: 'black',
    brand: null,
    description: null,
    checked_bag: { check_in: { booking_passenger_id: BOOKING_PASSENGER_ID } },
    ...data,
  }
}

function reportRow(data: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    status: 'open',
    booking_passenger_id: BOOKING_PASSENGER_ID,
    tag_number: null,
    flight_id: FLIGHT_ID,
    bag_type: 'suitcase',
    colour: 'black',
    brand: null,
    description: null,
    ...data,
  }
}

function makeSvc() {
  const db = {
    found_bag: { findUnique: jest.fn().mockResolvedValue(bagRow()), findMany: jest.fn().mockResolvedValue([]) },
    lost_bag_report: { findUnique: jest.fn().mockResolvedValue(reportRow()), findMany: jest.fn().mockResolvedValue([]) },
    bag_match: { createMany: jest.fn((args: { data: unknown[] }) => Promise.resolve({ count: args.data.length })) },
  }
  const svc = new BagMatchingService(db as unknown as DbService, { now: () => SIM_NOW })

  return { svc, db }
}

describe('BagMatchingService.matchFoundBag', () => {
  it('suggests a strong match for the owner and a possible one for a same-flight look-alike', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findMany.mockResolvedValue([
      reportRow(),
      reportRow({ id: OTHER_REPORT_ID, booking_passenger_id: '99999999-9999-4999-8999-999999999999' }),
    ])

    const result = await svc.matchFoundBag(FOUND_BAG_ID)

    expect(result).toEqual({ created: 2 })
    expect(db.lost_bag_report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['open', 'lost'] },
          OR: [
            { tag_number: '0789204511' },
            { booking_passenger_id: BOOKING_PASSENGER_ID },
            { flight_id: FLIGHT_ID, bag_type: 'suitcase', colour: 'black' },
          ],
          bag_match: { none: { found_bag_id: FOUND_BAG_ID } },
        },
      }),
    )
    expect(db.bag_match.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          report_id: REPORT_ID,
          found_bag_id: FOUND_BAG_ID,
          match_level: 'strong',
          status: 'suggested',
          suggested_at: SIM_NOW,
        }),
        expect.objectContaining({ report_id: OTHER_REPORT_ID, match_level: 'possible' }),
      ],
      skipDuplicates: true,
    })
  })

  it('leaves out candidates that are not similar enough', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(bagRow({ tag_number: null, checked_bag: null }))
    db.lost_bag_report.findMany.mockResolvedValue([reportRow({ colour: 'red' })])

    expect(await svc.matchFoundBag(FOUND_BAG_ID)).toEqual({ created: 0 })
    expect(db.bag_match.createMany).not.toHaveBeenCalled()
  })

  it('skips a bag that is no longer held', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(bagRow({ status: 'unclaimed' }))

    expect(await svc.matchFoundBag(FOUND_BAG_ID)).toEqual({ created: 0 })
    expect(db.lost_bag_report.findMany).not.toHaveBeenCalled()
  })

  it('does not search for an untagged bag with no flight or no type', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(bagRow({ tag_number: null, checked_bag: null, flight_id: null }))

    expect(await svc.matchFoundBag(FOUND_BAG_ID)).toEqual({ created: 0 })
    expect(db.lost_bag_report.findMany).not.toHaveBeenCalled()
  })
})

describe('BagMatchingService.matchReport', () => {
  it('searches held bags by owner, flight look-alike and tag', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findUnique.mockResolvedValue(reportRow({ tag_number: '0789204511' }))
    db.found_bag.findMany.mockResolvedValue([
      bagRow(),
      bagRow({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', tag_number: null, checked_bag: null, flight_id: OTHER_FLIGHT_ID }),
    ])

    const result = await svc.matchReport(REPORT_ID)

    expect(db.found_bag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'held',
          OR: [
            { checked_bag: { check_in: { booking_passenger_id: BOOKING_PASSENGER_ID } } },
            { flight_id: FLIGHT_ID, bag_type: 'suitcase', colour: 'black' },
            { tag_number: '0789204511' },
          ],
          bag_match: { none: { report_id: REPORT_ID } },
        },
      }),
    )
    // The second bag came off another flight with no tag, so only the first is suggested.
    expect(result).toEqual({ created: 1 })
  })

  it('does nothing for a case that already has a confirmed match', async () => {
    const { svc, db } = makeSvc()
    db.lost_bag_report.findUnique.mockResolvedValue(reportRow({ status: 'matched' }))

    expect(await svc.matchReport(REPORT_ID)).toEqual({ created: 0 })
    expect(db.found_bag.findMany).not.toHaveBeenCalled()
  })
})

describe('BagMatchingService listeners', () => {
  it('logs and swallows a matching failure so the saved bag is still returned', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockRejectedValue(new Error('db down'))
    const log = jest.spyOn((svc as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined)

    await expect(svc.onFoundBagRecorded({ id: FOUND_BAG_ID })).resolves.toBeUndefined()
    await expect(svc.suggestForReport(REPORT_ID)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledTimes(1)
  })
})
