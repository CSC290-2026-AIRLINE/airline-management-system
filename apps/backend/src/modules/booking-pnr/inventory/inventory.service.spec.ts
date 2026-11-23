jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

import type { DbService } from '@backend/db/db.service'
import type { BookingTransaction } from '../contracts'
import { InventoryService } from './inventory.service'

function fixture(overrides: Record<string, number> = {}) {
  const row = {
    flight_id: 'flight-a',
    cabin: 'economy',
    capacity: 10,
    held_count: 2,
    sold_count: 1,
    award_limit: 4,
    award_held_count: 1,
    award_sold_count: 1,
    ...overrides,
  }
  const update = jest.fn(({ data }: { data: Record<string, number | Date | { increment: number }> }) => {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null && 'increment' in value) row[key] += value.increment
      else row[key] = value
    }
    return Promise.resolve(row)
  })
  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([row])),
    seat_inventory: {
      findUniqueOrThrow: jest.fn(() => Promise.resolve(row)),
      findUnique: jest.fn(() => Promise.resolve(row)),
      findMany: jest.fn(() => Promise.resolve([row])),
      update,
      createMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  }
  const db = { ...tx, $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)) }
  const now = new Date('2026-11-09T08:00:00Z')
  return { row, tx, update, now, service: new InventoryService(db as unknown as DbService, { now: () => now }) }
}

const keys = [{ flightId: 'flight-a', cabin: 'economy' }]
const party = { adults: 1, children: 0, infants: 0 }

describe('InventoryService', () => {
  it('subtracts unused award seats and treats missing cabins as unavailable in one batch', async () => {
    const { service, tx } = fixture()
    expect(await service.availability([...keys, { flightId: 'missing', cabin: 'first' }], party)).toEqual([
      { ...keys[0], seatsLeft: 5 },
      { flightId: 'missing', cabin: 'first', seatsLeft: 0 },
    ])
    expect(tx.seat_inventory.findMany).toHaveBeenCalledTimes(1)
  })

  it('locks unique rows in flight and cabin order regardless of input order', async () => {
    const { service, tx } = fixture()
    await service.lock(tx as unknown as BookingTransaction, [
      { flightId: 'b', cabin: 'economy' },
      { flightId: 'a', cabin: 'first' },
      { flightId: 'a', cabin: 'business' },
      { flightId: 'b', cabin: 'economy' },
    ])
    expect(tx.$queryRaw.mock.calls.map((call: unknown[]) => call.slice(1))).toEqual([
      ['a', 'business'],
      ['a', 'first'],
      ['b', 'economy'],
    ])
  })

  it('refuses a missing inventory row', async () => {
    const { service, tx } = fixture()
    tx.$queryRaw.mockResolvedValueOnce([])
    await expect(service.lock(tx as unknown as BookingTransaction, keys)).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' })
  })

  it('protects award inventory from cash buyers', async () => {
    const { service, tx, update } = fixture()
    await expect(service.hold(tx as unknown as BookingTransaction, keys, 6)).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' })
    expect(update).not.toHaveBeenCalled()
  })

  it('moves award holds to sold and returns them without changing the reservation limit', async () => {
    const { service, tx, row, now } = fixture()
    const transaction = tx as unknown as BookingTransaction
    await service.hold(transaction, keys, 2, true)
    await service.sell(transaction, keys, 2, true)
    expect(row).toMatchObject({ held_count: 2, sold_count: 3, award_held_count: 1, award_sold_count: 3, award_limit: 4, updated_at: now })
    await service.returnSold(transaction, keys, 2, true)
    expect(row).toMatchObject({ held_count: 2, sold_count: 1, award_held_count: 1, award_sold_count: 1 })
  })

  it('does not release award holds as cash or decrement beyond the source count', async () => {
    const { service, tx, update } = fixture()
    await expect(service.release(tx as unknown as BookingTransaction, keys, 2)).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE' })
    expect(update).not.toHaveBeenCalled()
  })

  it('maps the named oversell trigger error and preserves unrelated database errors', async () => {
    const { service, tx, update } = fixture()
    update.mockRejectedValueOnce({ meta: { driverAdapterError: { cause: { constraint: 'seat_inventory_no_oversell', code: '23514' } } } })
    await expect(service.hold(tx as unknown as BookingTransaction, keys, 1)).rejects.toMatchObject({ code: 'SEAT_UNAVAILABLE' })
    const error = new Error('connection lost')
    update.mockRejectedValueOnce(error)
    await expect(service.hold(tx as unknown as BookingTransaction, keys, 1)).rejects.toBe(error)
  })

  it('lowers award seats only as far as used awards and leaves a repeat unchanged', async () => {
    const { service, row, update } = fixture()
    await service.setAwardSeats('flight-a', 'economy', 0)
    expect(row.award_limit).toBe(2)
    await service.setAwardSeats('flight-a', 'economy', 0)
    await service.setAwardSeats('flight-a', 'economy', 9)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('permits reduced capacity below sold seats while removing unused awards', async () => {
    const { service, tx, row } = fixture({ sold_count: 7 })
    await service.setCapacity(tx as unknown as BookingTransaction, 'flight-a', 'economy', 5)
    expect(row).toMatchObject({ capacity: 5, award_limit: 2 })
    expect(await service.seatsLeft('flight-a', 'economy')).toBe(0)
  })

  it('creates inventory without overwriting existing counts on replay', async () => {
    const { service, tx } = fixture()
    await service.createForFlight('flight-a', [{ cabin: 'economy', capacity: 10 }])
    expect(tx.seat_inventory.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }))
  })
  it('uses the supplied event transaction rather than the root database', async () => {
    const { service, tx } = fixture()
    const createMany = jest.fn().mockResolvedValue({ count: 1 })
    const eventTx = { seat_inventory: { createMany } } as unknown as BookingTransaction
    await service.createForFlight('flight-a', [{ cabin: 'economy', capacity: 10 }], eventTx)
    expect(createMany).toHaveBeenCalledTimes(1)
    expect(tx.seat_inventory.createMany).not.toHaveBeenCalled()
  })
})
