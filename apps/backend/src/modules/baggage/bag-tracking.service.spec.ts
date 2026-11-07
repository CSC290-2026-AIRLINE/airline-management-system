import { BagTrackingService, currentLocation } from './bag-tracking.service'
import type { DbService } from '@backend/db/db.service'
import type { BagLocationEvent } from './common/bag-location.types'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const BAG_ID = '66666666-6666-4666-8666-666666666666'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const SIM_NOW = new Date('2026-11-01T10:00:00Z')

interface EventRow {
  found_bag_id: string
  airport_code: string
  action: string
  to_airport: string | null
  occurred_at: Date
}

function eventRow(action: string, airport: string, toAirport: string | null = null): EventRow {
  return { found_bag_id: BAG_ID, airport_code: airport, action, to_airport: toAirport, occurred_at: new Date('2026-10-31T00:00:00Z') }
}

function makeSvc(opts: { status?: string | null; last?: EventRow | null } = {}) {
  const status = opts.status === undefined ? 'held' : opts.status
  const db = {
    found_bag: { findUnique: jest.fn().mockResolvedValue({ id: BAG_ID }) },
    bag_location_event: {
      findFirst: jest.fn().mockResolvedValue(opts.last === undefined ? eventRow('found', 'NRT') : opts.last),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest.fn().mockResolvedValue(status === null ? [] : [{ status }]),
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))

  return { svc: new BagTrackingService(db as unknown as DbService, { now: () => SIM_NOW }), db }
}

const base = { staffId: STAFF_ID, foundBagId: BAG_ID }

describe('BagTrackingService.recordMove', () => {
  it('sends a bag from where it is, with the flight', async () => {
    const { svc, db } = makeSvc()

    await svc.recordMove({ ...base, action: 'sent', toAirport: 'bkk', sentOnFlightId: FLIGHT_ID, note: ' on TG641 ' })

    expect(db.bag_location_event.create).toHaveBeenCalledWith({
      data: {
        found_bag_id: BAG_ID,
        airport_code: 'NRT',
        action: 'sent',
        to_airport: 'BKK',
        sent_on_flight_id: FLIGHT_ID,
        note: 'on TG641',
        staff_id: STAFF_ID,
        occurred_at: SIM_NOW,
      },
    })
  })

  it('records arrived at the airport the bag was sent to', async () => {
    const { svc, db } = makeSvc({ last: eventRow('sent', 'NRT', 'BKK') })

    await svc.recordMove({ ...base, action: 'arrived' })

    expect(db.bag_location_event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'arrived', airport_code: 'BKK', to_airport: null }),
    })
  })

  it('refuses arrived for a bag that is not in transit', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.recordMove({ ...base, action: 'arrived' })).rejects.toMatchObject({ code: 'INVALID_MOVE', status: 409 })
    expect(db.bag_location_event.create).not.toHaveBeenCalled()
  })

  it('refuses held or sent while the bag is in transit', async () => {
    const { svc } = makeSvc({ last: eventRow('sent', 'NRT', 'BKK') })

    await expect(svc.recordMove({ ...base, action: 'held' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
    await expect(svc.recordMove({ ...base, action: 'sent', toAirport: 'CNX' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
  })

  it('refuses sending a bag to the airport it is already at', async () => {
    const { svc } = makeSvc()

    await expect(svc.recordMove({ ...base, action: 'sent', toAirport: 'NRT' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
  })

  it('needs a destination for sent and refuses one for other actions', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.recordMove({ ...base, action: 'sent' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
    await expect(svc.recordMove({ ...base, action: 'held', toAirport: 'BKK' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses actions staff do not record by hand', async () => {
    const { svc } = makeSvc()

    await expect(svc.recordMove({ ...base, action: 'delivered' as never })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
  })

  it('refuses to move a closed bag', async () => {
    const { svc } = makeSvc({ status: 'unclaimed' })

    await expect(svc.recordMove({ ...base, action: 'held' })).rejects.toMatchObject({ code: 'BAG_CLOSED', status: 409 })
  })

  it('reports a missing bag', async () => {
    const { svc } = makeSvc({ status: null })

    await expect(svc.recordMove({ ...base, action: 'held' })).rejects.toMatchObject({ code: 'FOUND_BAG_NOT_FOUND', status: 404 })
  })

  it('maps an unknown destination airport or flight (P2003) to INVALID_MOVE', async () => {
    const { svc, db } = makeSvc()
    db.bag_location_event.create.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))

    await expect(svc.recordMove({ ...base, action: 'sent', toAirport: 'ZZZ' })).rejects.toMatchObject({ code: 'INVALID_MOVE' })
  })
})

describe('BagTrackingService.getHistory', () => {
  it('returns events oldest first with the current location', async () => {
    const { svc, db } = makeSvc()
    db.bag_location_event.findMany.mockResolvedValue([
      { id: 'e1', ...eventRow('found', 'NRT'), sent_on_flight_id: null, note: null, staff_id: STAFF_ID, created_at: SIM_NOW },
      { id: 'e2', ...eventRow('sent', 'NRT', 'BKK'), sent_on_flight_id: FLIGHT_ID, note: null, staff_id: STAFF_ID, created_at: SIM_NOW },
    ])

    const history = await svc.getHistory(BAG_ID)

    expect(db.bag_location_event.findMany).toHaveBeenCalledWith({
      where: { found_bag_id: BAG_ID },
      orderBy: [{ occurred_at: 'asc' }, { created_at: 'asc' }],
    })
    expect(history.events.map((e) => e.action)).toEqual(['found', 'sent'])
    expect(history.current).toMatchObject({ airportCode: 'NRT', inTransit: true, toAirport: 'BKK', lastAction: 'sent' })
  })

  it('reports a missing bag', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue(null)

    await expect(svc.getHistory(BAG_ID)).rejects.toMatchObject({ code: 'FOUND_BAG_NOT_FOUND' })
  })
})

describe('currentLocation', () => {
  it('is null without events and not in transit after arrived', () => {
    expect(currentLocation([])).toBeNull()
    expect(
      currentLocation([{ action: 'arrived', airportCode: 'BKK', toAirport: null, occurredAt: SIM_NOW } as BagLocationEvent]),
    ).toMatchObject({
      airportCode: 'BKK',
      inTransit: false,
      toAirport: null,
    })
  })
})
