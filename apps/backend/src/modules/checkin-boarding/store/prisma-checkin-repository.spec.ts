import { Prisma } from '../../../db/generated/prisma/client'
import { FixtureClock } from '../providers/fixture-providers'
import { PrismaCheckInRepository } from './prisma-checkin-repository'
import { toBagRecord, toCheckInRecord, toDocumentRecord } from './prisma-mappers'

// The generated client is ESM-only and Jest cannot load it; the tests need its Decimal and nothing else.
jest.mock('../../../db/generated/prisma/client', () => ({
  Prisma: {
    Decimal: class Decimal {
      constructor(private readonly value: string) {}
      toString(): string {
        return this.value
      }
    },
  },
}))
// The repository takes DbService as a type, but the import must not pull the ESM client in.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-11T01:00:00.000Z')

const checkInRow = {
  id: 'ci-1',
  booking_passenger_id: 'bp-1',
  passenger_id: 'pax-1',
  flight_id: 'flt-fy204',
  status: 'started',
  declared_bags: null,
  screening_run_id: null,
  checked_in_at: null,
  created_at: NOW,
  updated_at: NOW,
}

const documentRow = {
  id: 'td-1',
  check_in_id: 'ci-1',
  doc_type: 'P',
  number_last4: '4567',
  issuing_country: 'th',
  nationality: 'th',
  expiry_date: new Date('2030-04-15T00:00:00.000Z'),
  visa_number: null,
  visa_checked_by: null,
  visa_checked_at: null,
  name_mismatch: false,
  name_mismatch_cleared_by: null,
  name_mismatch_cleared_at: null,
  profile_differences: [],
  profile_differences_cleared_by: null,
  profile_differences_cleared_at: null,
  created_at: NOW,
  updated_at: NOW,
}

const bagRow = {
  id: 'bag-1',
  check_in_id: 'ci-1',
  tag_number: null,
  weight_kg: 25,
  excess_kg: 5,
  rate_per_kg: 500,
  excess_fee: 2500,
  excess_payment_id: null,
  status: 'weighed',
  weighed_by: 'staff-1',
  weighed_at: NOW,
  created_at: NOW,
  updated_at: NOW,
  deleted_at: null,
}

const carryOnRow = {
  id: 'co-1',
  check_in_id: 'ci-1',
  weight_kg: 6.4,
  within_size: true,
  result: 'ok',
  staff_id: 'staff-1',
  checked_at: NOW,
  created_at: NOW,
}

const eventRow = {
  id: 'ev-1',
  flight_id: 'flt-fy204',
  gate_id: 'gate-a1',
  boarding_pass_id: 'pass-1',
  scanned_reference: 'H3VN8PLA',
  event: 'boarded',
  reason: null,
  staff_id: 'staff-1',
  occurred_at: NOW,
  created_at: NOW,
}

const eventInput = {
  flight_id: 'flt-fy204',
  gate_id: 'gate-a1',
  boarding_pass_id: 'pass-1',
  scanned_reference: 'H3VN8PLA',
  event: 'boarded' as const,
  reason: null,
  staff_id: 'staff-1',
  occurred_at: NOW,
}

/** A hand-written fake of the Prisma client: one jest.fn() per model method the repository calls. */
const fakeDb = () => ({
  check_in: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  travel_document: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  checked_bag: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  carry_on_check: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  flight_boarding: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  boarding_pass: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  boarding_event: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  gate: { findUnique: jest.fn(), findMany: jest.fn() },
  $queryRaw: jest.fn(),
})

const build = () => {
  const db = fakeDb()
  const clock = new FixtureClock()
  return { db, clock, repo: new PrismaCheckInRepository(db as any, clock) }
}

describe('the Prisma mappers', () => {
  it('maps a check_in row to the record', () => {
    const record = toCheckInRecord(checkInRow)
    expect(record.created_at).toEqual(NOW)
    expect(record.status).toBe('started')
    expect(record.booking_passenger_id).toBe('bp-1')
  })

  it('maps bag decimals to numbers', () => {
    const record = toBagRecord({ ...bagRow, excess_fee: new Prisma.Decimal('5250.00') })
    expect(record.excess_fee).toBe(5250)
    expect(record.weight_kg).toBe(25)
  })

  it('maps the passport expiry to an ISO day', () => {
    expect(toDocumentRecord(documentRow).expiry_date).toBe('2030-04-15')
  })
})

describe('PrismaCheckInRepository', () => {
  it('soft-deletes a bag', async () => {
    const { db, repo } = build()
    db.checked_bag.findFirst.mockResolvedValue(bagRow)
    db.checked_bag.update.mockResolvedValue({ ...bagRow, deleted_at: new Date() })
    await repo.deleteBag('bag-1')
    expect(db.checked_bag.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bag-1' }, data: expect.objectContaining({ deleted_at: expect.any(Date) }) }),
    )
  })

  it('refuses to remove a tagged bag', async () => {
    const { db, repo } = build()
    db.checked_bag.findFirst.mockResolvedValue({ ...bagRow, tag_number: '0402000001', status: 'tagged' })
    await expect(repo.deleteBag('bag-1')).rejects.toMatchObject({ code: 'INVALID_STATE' })
    expect(db.checked_bag.update).not.toHaveBeenCalled()
  })

  it('does not find a bag that was removed', async () => {
    const { db, repo } = build()
    db.checked_bag.findFirst.mockResolvedValue(null)
    await expect(repo.getBag('bag-1')).resolves.toBeNull()
    expect(db.checked_bag.findFirst).toHaveBeenCalledWith({ where: { id: 'bag-1', deleted_at: null } })
  })

  it('lists the bags in the order they were weighed', async () => {
    const { db, repo } = build()
    db.checked_bag.findMany.mockResolvedValue([bagRow])
    await repo.listBags('ci-1')
    expect(db.checked_bag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { check_in_id: 'ci-1', deleted_at: null }, orderBy: { created_at: 'asc' } }),
    )
  })

  it('a double submit of the same check-in gets the open one back', async () => {
    const { db, repo } = build()
    db.check_in.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
    db.check_in.findFirst.mockResolvedValueOnce(checkInRow)
    const input = { booking_passenger_id: 'bp-1', passenger_id: 'pax-1', flight_id: 'flt-fy204', status: 'started' as const }
    await expect(repo.createCheckIn(input)).resolves.toMatchObject({ id: checkInRow.id })
    expect(db.check_in.findFirst).toHaveBeenCalledWith({ where: { booking_passenger_id: 'bp-1', status: { not: 'cancelled' } } })
  })

  it('turns a duplicate final event into ALREADY_BOARDED', async () => {
    const { db, repo } = build()
    db.boarding_event.create
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }))
      .mockResolvedValueOnce({ ...eventRow, event: 'rejected', reason: 'ALREADY_BOARDED' })
    const event = await repo.appendEvent(eventInput)
    expect(event.event).toBe('rejected')
    expect(event.reason).toBe('ALREADY_BOARDED')
    expect(db.boarding_event.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ event: 'rejected', reason: 'ALREADY_BOARDED' }),
    })
  })

  it('reads the bag tag sequence', async () => {
    const { db, repo } = build()
    db.$queryRaw.mockResolvedValue([{ nextval: 7n }])
    await expect(repo.nextBagTagSeq()).resolves.toBe(7)
  })

  it('fails when the bag tag sequence gives nothing', async () => {
    const { db, repo } = build()
    db.$queryRaw.mockResolvedValue([])
    await expect(repo.nextBagTagSeq()).rejects.toThrow('bag_tag_seq returned no value')
  })

  it('stamps updated_at from the clock on every update', async () => {
    const { db, clock, repo } = build()
    const later = new Date('2026-11-11T02:00:00.000Z')
    clock.set(later)
    db.check_in.update.mockResolvedValue({ ...checkInRow, updated_at: later })
    await repo.updateCheckIn('ci-1', { declared_bags: 2 })
    expect(db.check_in.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ci-1' }, data: expect.objectContaining({ declared_bags: 2, updated_at: later }) }),
    )
  })

  it('answers a missing row with NOT_FOUND', async () => {
    const { db, repo } = build()
    db.check_in.update.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2025' }))
    await expect(repo.updateCheckIn('ci-1', { declared_bags: 2 })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('searches on the pnr and the passenger name', async () => {
    const { db, repo } = build()
    db.check_in.findMany.mockResolvedValue([checkInRow])
    await repo.searchCheckIns({ pnr: 'ER224F', name: 'Eriksson' })
    expect(db.check_in.findMany).toHaveBeenCalledWith({
      where: {
        booking_coupon: { booking_passenger: { booking: { booking_reference: { contains: 'ER224F', mode: 'insensitive' } } } },
        AND: [
          {
            passenger: {
              OR: [
                { first_name: { contains: 'Eriksson', mode: 'insensitive' } },
                { last_name: { contains: 'Eriksson', mode: 'insensitive' } },
              ],
            },
          },
        ],
      },
      orderBy: { created_at: 'asc' },
    })
  })

  it('searches a full name word by word', async () => {
    const { db, repo } = build()
    db.check_in.findMany.mockResolvedValue([checkInRow])
    await repo.searchCheckIns({ name: 'Anna Eriksson' })
    const where = db.check_in.findMany.mock.calls[0][0].where
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0].passenger.OR[0].first_name).toEqual({ contains: 'Anna', mode: 'insensitive' })
    expect(where.AND[1].passenger.OR[1].last_name).toEqual({ contains: 'Eriksson', mode: 'insensitive' })
  })

  it('keeps one carry-on check per check-in', async () => {
    const { db, repo } = build()
    db.carry_on_check.findFirst.mockResolvedValue(carryOnRow)
    db.carry_on_check.update.mockResolvedValue(carryOnRow)
    await repo.upsertCarryOnCheck({ check_in_id: 'ci-1', weight_kg: 6.4, within_size: true, result: 'ok', staff_id: 'staff-1' })
    expect(db.carry_on_check.update).toHaveBeenCalled()
    expect(db.carry_on_check.create).not.toHaveBeenCalled()
  })
})
