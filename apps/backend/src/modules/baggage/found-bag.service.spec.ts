import { FoundBagService } from './found-bag.service'
import type { DbService } from '@backend/db/db.service'
import type { CheckedBagRecord, FoundBagRecordedListener } from './common/found-bag.ports'
import type { FoundBag } from './common/found-bag.types'

// The service only uses Prisma as types, so DbService is the only mock (same approach as admin-console).
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const FLIGHT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_FLIGHT_ID = '33333333-3333-4333-8333-333333333333'
const CHECKED_BAG_ID = '44444444-4444-4444-8444-444444444444'
const BOOKING_PASSENGER_ID = '55555555-5555-4555-8555-555555555555'
const FOUND_BAG_ID = '66666666-6666-4666-8666-666666666666'
const SIM_NOW = new Date('2026-10-30T08:00:00Z')

function prismaError(code: string) {
  return Object.assign(new Error(code), { code })
}

function makeSvc() {
  const db = {
    found_bag: {
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: FOUND_BAG_ID, ...args.data })),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    checked_bag: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    bag_location_event: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  }
  db.$transaction.mockImplementation((cb: (tx: typeof db) => unknown) => cb(db))
  const recorded: { bag: FoundBag; checkedBag: CheckedBagRecord | null }[] = []
  const listener: FoundBagRecordedListener = {
    onFoundBagRecorded: (bag, checkedBag) => {
      recorded.push({ bag, checkedBag })
      return Promise.resolve()
    },
  }
  const svc = new FoundBagService(db as unknown as DbService, { now: () => SIM_NOW }, [listener])

  return { svc, db, recorded }
}

const validInput = {
  staffId: STAFF_ID,
  foundAirport: 'NRT',
  bagType: 'suitcase' as const,
  colour: 'black' as const,
}

const knownCheckedBag = {
  id: CHECKED_BAG_ID,
  tag_number: '0123456789',
  check_in: { booking_passenger_id: BOOKING_PASSENGER_ID, flight_id: FLIGHT_ID },
}

describe('FoundBagService.record', () => {
  it('writes a held staff row with the simulation time', async () => {
    const { svc, db } = makeSvc()

    const bag = await svc.record(validInput)

    expect(db.found_bag.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'staff',
        status: 'held',
        recorded_by: STAFF_ID,
        found_airport: 'NRT',
        found_at: SIM_NOW,
        checked_bag_id: null,
        tag_number: null,
      }),
    })
    expect(bag).toMatchObject({ id: FOUND_BAG_ID, status: 'held', source: 'staff', recordedBy: STAFF_ID, foundAt: SIM_NOW })
  })

  it('writes the first tracking event in the same transaction', async () => {
    const { svc, db } = makeSvc()

    await svc.record(validInput)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.bag_location_event.create).toHaveBeenCalledWith({
      data: { found_bag_id: FOUND_BAG_ID, airport_code: 'NRT', action: 'found', staff_id: STAFF_ID, occurred_at: SIM_NOW },
    })
  })

  it('links a tagged bag to its Feature 6 checked bag', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue(knownCheckedBag)

    const bag = await svc.record({ ...validInput, tagNumber: '0123456789' })

    expect(db.checked_bag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tag_number: '0123456789', deleted_at: null } }),
    )
    expect(bag.checkedBagId).toBe(CHECKED_BAG_ID)
    expect(bag.tagNumber).toBe('0123456789')
  })

  it('keeps the flight the bag came off instead of the booked flight', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue(knownCheckedBag)

    const bag = await svc.record({ ...validInput, tagNumber: '0123456789', flightId: OTHER_FLIGHT_ID })

    expect(bag.flightId).toBe(OTHER_FLIGHT_ID)
  })

  it('records a tag Feature 6 does not know without an owner link', async () => {
    const { svc } = makeSvc()

    const bag = await svc.record({ ...validInput, tagNumber: '0555555555' })

    expect(bag.tagNumber).toBe('0555555555')
    expect(bag.checkedBagId).toBeNull()
  })

  it('rejects an invalid baggage tag before touching the database', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.record({ ...validInput, tagNumber: '1234567890' })).rejects.toMatchObject({ code: 'INVALID_TAG' })
    expect(db.found_bag.create).not.toHaveBeenCalled()
  })

  it('rejects a bag type or colour outside the fixed lists', async () => {
    const { svc } = makeSvc()

    await expect(svc.record({ ...validInput, colour: 'navy' as never })).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG' })
  })

  it('requires the recording staff id', async () => {
    const { svc } = makeSvc()

    await expect(svc.record({ ...validInput, staffId: ' ' })).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG' })
  })

  it('rejects a flight id that is not a UUID', async () => {
    const { svc } = makeSvc()

    await expect(svc.record({ ...validInput, flightId: 'TG640' })).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG' })
  })

  it('requires a 3-letter airport code and normalises its case', async () => {
    const { svc } = makeSvc()

    await expect(svc.record({ ...validInput, foundAirport: 'Tokyo' })).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG' })

    const bag = await svc.record({ ...validInput, foundAirport: 'bkk' })

    expect(bag.foundAirport).toBe('BKK')
  })

  it('refuses a checked bag that already has a live found_bag row', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue(knownCheckedBag)
    db.found_bag.findFirst.mockResolvedValue({ id: FOUND_BAG_ID })

    await expect(svc.record({ ...validInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'FOUND_BAG_EXISTS' })
    expect(db.found_bag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { checked_bag_id: CHECKED_BAG_ID, status: { not: 'continued_with_flight' } } }),
    )
    expect(db.found_bag.create).not.toHaveBeenCalled()
  })

  it('maps a unique-index race (P2002) to FOUND_BAG_EXISTS with HTTP 409', async () => {
    const { svc, db } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue(knownCheckedBag)
    db.found_bag.create.mockRejectedValue(prismaError('P2002'))

    await expect(svc.record({ ...validInput, tagNumber: '0123456789' })).rejects.toMatchObject({ code: 'FOUND_BAG_EXISTS', status: 409 })
  })

  it('maps a missing airport, flight or staff (P2003) to INVALID_FOUND_BAG', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.create.mockRejectedValue(prismaError('P2003'))

    await expect(svc.record(validInput)).rejects.toMatchObject({ code: 'INVALID_FOUND_BAG', status: 400 })
  })

  it('notifies listeners with the Feature 6 bag so matching can run', async () => {
    const { svc, db, recorded } = makeSvc()
    db.checked_bag.findFirst.mockResolvedValue(knownCheckedBag)

    const bag = await svc.record({ ...validInput, tagNumber: '0123456789' })

    expect(recorded).toHaveLength(1)
    expect(recorded[0].bag.id).toBe(bag.id)
    expect(recorded[0].checkedBag?.bookingPassengerId).toBe(BOOKING_PASSENGER_ID)
  })
})

describe('FoundBagService.getById', () => {
  it('returns the mapped row', async () => {
    const { svc, db } = makeSvc()
    db.found_bag.findUnique.mockResolvedValue({ id: FOUND_BAG_ID, found_airport: 'NRT', status: 'held' })

    await expect(svc.getById(FOUND_BAG_ID)).resolves.toMatchObject({ id: FOUND_BAG_ID, foundAirport: 'NRT' })
  })

  it('reports a missing bag, and a non-UUID id without querying', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.getById(FOUND_BAG_ID)).rejects.toMatchObject({ code: 'FOUND_BAG_NOT_FOUND', status: 404 })
    await expect(svc.getById('missing')).rejects.toMatchObject({ code: 'FOUND_BAG_NOT_FOUND' })
    expect(db.found_bag.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe('FoundBagService.list', () => {
  it('builds the where clause from trimmed, normalised filters', async () => {
    const { svc, db } = makeSvc()

    await svc.list({ tagNumber: ' 0123456789 ', foundAirport: 'bkk', status: 'held', flightId: FLIGHT_ID })

    expect(db.found_bag.findMany).toHaveBeenCalledWith({
      where: { tag_number: '0123456789', found_airport: 'BKK', status: 'held', flight_id: FLIGHT_ID },
      orderBy: [{ found_at: 'desc' }, { id: 'asc' }],
      take: 500,
    })
  })

  it('returns nothing for a flight id that is not a UUID', async () => {
    const { svc, db } = makeSvc()

    await expect(svc.list({ flightId: 'TG640' })).resolves.toEqual([])
    expect(db.found_bag.findMany).not.toHaveBeenCalled()
  })
})
