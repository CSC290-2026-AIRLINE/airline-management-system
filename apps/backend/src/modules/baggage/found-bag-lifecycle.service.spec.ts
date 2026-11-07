import { FoundBagLifecycleService } from './found-bag-lifecycle.service'
import type { DbService } from '@backend/db/db.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const BAG_ID = '66666666-6666-4666-8666-666666666666'
const SIM_NOW = new Date('2026-11-07T00:00:00Z')

function foundBagRow(o: Record<string, unknown> = {}) {
  return {
    id: BAG_ID,
    checked_bag_id: 'cb-1',
    tag_number: '0123456789',
    flight_id: FLIGHT_ID,
    bag_type: null,
    colour: null,
    brand: null,
    description: null,
    found_airport: 'CNX',
    found_at: SIM_NOW,
    source: 'diverted_flight',
    status: 'held',
    recorded_by: null,
    created_at: SIM_NOW,
    updated_at: SIM_NOW,
    ...o,
  }
}

function makeSvc() {
  let created = 0
  const db = {
    flight: { findUnique: jest.fn().mockResolvedValue({ status: 'diverted', actual_destination: 'CNX', route: { destination: 'BKK' } }) },
    checked_bag: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'cb-1', tag_number: '0123456789' },
        { id: 'cb-2', tag_number: '0123456790' },
      ]),
      count: jest.fn().mockResolvedValue(3),
    },
    found_bag: {
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(foundBagRow({ id: `fb-${++created}`, ...args.data }))),
      findUnique: jest.fn().mockResolvedValue(foundBagRow()),
      update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(foundBagRow(args.data))),
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(foundBagRow({ status: 'continued_with_flight' })),
    },
    bag_location_event: { create: jest.fn().mockResolvedValue({}) },
    baggage_setting: { findUnique: jest.fn().mockResolvedValue({ value: '90' }) },
    $queryRaw: jest.fn().mockResolvedValue([{ id: BAG_ID, status: 'held' }]),
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => Promise.resolve(cb(db)))

  return { svc: new FoundBagLifecycleService(db as unknown as DbService, { now: () => SIM_NOW }), db }
}

describe('FoundBagLifecycleService.recordDiversion', () => {
  it('adds a held diverted-flight row and a system event for each bag without a live row', async () => {
    const { svc, db } = makeSvc()

    const result = await svc.recordDiversion(FLIGHT_ID)

    expect(result).toMatchObject({ flightId: FLIGHT_ID, divertedTo: 'CNX', skipped: 1 })
    expect(result.created).toHaveLength(2)
    expect(db.found_bag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        checked_bag_id: 'cb-1',
        source: 'diverted_flight',
        status: 'held',
        recorded_by: null,
        found_airport: 'CNX',
        found_at: SIM_NOW,
      }),
    })
    expect(db.bag_location_event.create).toHaveBeenCalledWith({
      data: { found_bag_id: 'fb-1', airport_code: 'CNX', action: 'at_diverted_airport', staff_id: null, occurred_at: SIM_NOW },
    })
    expect(db.checked_bag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'tagged',
          check_in: { flight_id: FLIGHT_ID, status: { in: ['checked_in', 'boarded'] } },
          found_bag: { none: { status: { not: 'continued_with_flight' } } },
        }),
      }),
    )
  })

  it('refuses a flight that is not diverted', async () => {
    const { svc, db } = makeSvc()
    db.flight.findUnique.mockResolvedValue({ status: 'arrived', actual_destination: null })

    await expect(svc.recordDiversion(FLIGHT_ID)).rejects.toMatchObject({ code: 'FLIGHT_NOT_DIVERTED', status: 409 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('maps a race on the unique index (P2002) to FOUND_BAG_EXISTS', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }))

    await expect(svc.recordDiversion(FLIGHT_ID)).rejects.toMatchObject({ code: 'FOUND_BAG_EXISTS' })
  })
})

describe('FoundBagLifecycleService.completeDetails', () => {
  it('adds type and colour to a held diverted-flight bag', async () => {
    const { svc, db } = makeSvc()

    const bag = await svc.completeDetails(STAFF_ID, BAG_ID, { bagType: 'suitcase', colour: 'red', brand: ' Rimowa ' })

    expect(db.found_bag.update).toHaveBeenCalledWith({
      where: { id: BAG_ID },
      data: expect.objectContaining({ bag_type: 'suitcase', colour: 'red', brand: 'Rimowa', description: null }),
    })
    expect(bag).toMatchObject({ bagType: 'suitcase', colour: 'red' })
  })

  it('refuses a staff-recorded bag or a bag that is no longer held', async () => {
    const { svc, db } = makeSvc()

    db.found_bag.findUnique.mockResolvedValueOnce(foundBagRow({ source: 'staff' }))
    await expect(svc.completeDetails(STAFF_ID, BAG_ID, { bagType: 'suitcase', colour: 'red' })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    })

    db.found_bag.findUnique.mockResolvedValueOnce(foundBagRow({ status: 'unclaimed' }))
    await expect(svc.completeDetails(STAFF_ID, BAG_ID, { bagType: 'suitcase', colour: 'red' })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    })

    expect(db.found_bag.update).not.toHaveBeenCalled()
  })

  it('rejects a colour outside the fixed list', async () => {
    const { svc } = makeSvc()

    await expect(svc.completeDetails(STAFF_ID, BAG_ID, { bagType: 'suitcase', colour: 'navy' as never })).rejects.toMatchObject({
      code: 'INVALID_FOUND_BAG',
    })
  })
})

describe('FoundBagLifecycleService.continueWithFlight', () => {
  it('closes the row and records that the bag flew on to the route destination', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.updateMany.mockResolvedValueOnce({ count: 1 })

    const bag = await svc.continueWithFlight(STAFF_ID, BAG_ID)

    expect(bag.status).toBe('continued_with_flight')
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FROM found_bag')
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.found_bag.updateMany.mock.invocationCallOrder[0])
    expect(db.found_bag.updateMany).toHaveBeenCalledWith({
      where: { id: BAG_ID, status: 'held' },
      data: expect.objectContaining({ status: 'continued_with_flight' }),
    })
    expect(db.bag_location_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        airport_code: 'CNX',
        action: 'sent',
        to_airport: 'BKK',
        sent_on_flight_id: FLIGHT_ID,
        staff_id: STAFF_ID,
      }),
    })
  })

  it('checks held again under the lock, after a match was confirmed at the same time', async () => {
    const { svc, db } = makeSvc()
    db.$queryRaw.mockResolvedValue([{ id: BAG_ID, status: 'matched' }])

    await expect(svc.continueWithFlight(STAFF_ID, BAG_ID)).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
    expect(db.found_bag.updateMany).not.toHaveBeenCalled()
    expect(db.bag_location_event.create).not.toHaveBeenCalled()
  })

  it('rolls back when the conditional update finds the bag no longer held', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(svc.continueWithFlight(STAFF_ID, BAG_ID)).rejects.toMatchObject({ code: 'INVALID_STATUS' })
    expect(db.bag_location_event.create).not.toHaveBeenCalled()
  })

  it('refuses a bag that is not a held diverted-flight bag', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(foundBagRow({ source: 'staff', flight_id: null }))

    await expect(svc.continueWithFlight(STAFF_ID, BAG_ID)).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
  })
})

describe('FoundBagLifecycleService.markUnclaimed', () => {
  it('marks held bags past the setting with no confirmed match', async () => {
    const { svc, db } = makeSvc()

    const result = await svc.markUnclaimed()

    const cutoff = new Date('2026-08-09T00:00:00Z')
    expect(result).toEqual({ unclaimedAfterDays: 90, cutoff, marked: 4 })
    expect(db.found_bag.updateMany).toHaveBeenCalledWith({
      where: { status: 'held', found_at: { lte: cutoff }, bag_match: { none: { status: 'confirmed' } } },
      data: { status: 'unclaimed', updated_at: expect.any(Date) },
    })
  })

  it('falls back to 90 days when the setting is missing or invalid', async () => {
    const { svc, db } = makeSvc()
    db.baggage_setting.findUnique.mockResolvedValue({ value: 'abc' })

    await expect(svc.markUnclaimed()).resolves.toMatchObject({ unclaimedAfterDays: 90 })
  })

  it('uses the configured number of days', async () => {
    const { svc, db } = makeSvc()
    db.baggage_setting.findUnique.mockResolvedValue({ value: '30' })

    await expect(svc.markUnclaimed()).resolves.toMatchObject({ unclaimedAfterDays: 30, cutoff: new Date('2026-10-08T00:00:00Z') })
  })
})
