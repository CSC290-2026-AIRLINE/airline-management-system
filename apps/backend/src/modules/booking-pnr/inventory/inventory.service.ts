import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { seat_inventory } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import {
  BOOKING_CLOCK,
  type BookingClock,
  type BookingTransaction,
  type FlightAvailabilityRequest,
  type InventoryCabin,
  type InventoryKey,
  type InventoryPort,
  type Party,
} from '../contracts'

function orderedKeys(keys: InventoryKey[]): InventoryKey[] {
  return [...new Map(keys.map((key) => [`${key.flightId}/${key.cabin}`, key])).values()].sort((a, b) =>
    a.flightId < b.flightId ? -1 : a.flightId > b.flightId ? 1 : a.cabin < b.cabin ? -1 : a.cabin > b.cabin ? 1 : 0,
  )
}

function cashSeats(row: seat_inventory): number {
  return Math.max(0, row.capacity - row.held_count - row.sold_count - (row.award_limit - row.award_held_count - row.award_sold_count))
}

function nonNegative(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new BookingError('INVALID_BOOKING_STATE', 'Seat counts must be non-negative integers', 422)
}

@Injectable()
export class InventoryService implements InventoryPort {
  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  async lock(tx: BookingTransaction, keys: InventoryKey[]): Promise<void> {
    for (const key of orderedKeys(keys)) {
      const rows = await tx.$queryRaw<seat_inventory[]>`
        SELECT * FROM seat_inventory
        WHERE flight_id = ${key.flightId}::uuid AND cabin = ${key.cabin}
        FOR UPDATE
      `
      if (!rows.length) throw new BookingError('SEAT_UNAVAILABLE', 'Flight cabin has no inventory')
    }
  }

  hold(tx: BookingTransaction, keys: InventoryKey[], count: number, award = false): Promise<void> {
    return this.move(tx, keys, count, award, 'hold')
  }

  sell(tx: BookingTransaction, keys: InventoryKey[], count: number, award = false): Promise<void> {
    return this.move(tx, keys, count, award, 'sell')
  }

  release(tx: BookingTransaction, keys: InventoryKey[], count: number, award = false): Promise<void> {
    return this.move(tx, keys, count, award, 'release')
  }

  returnSold(tx: BookingTransaction, keys: InventoryKey[], count: number, award = false): Promise<void> {
    return this.move(tx, keys, count, award, 'returnSold')
  }

  private async move(
    tx: BookingTransaction,
    keys: InventoryKey[],
    count: number,
    award: boolean,
    action: 'hold' | 'sell' | 'release' | 'returnSold',
  ) {
    nonNegative(count)
    await this.lock(tx, keys)
    for (const key of orderedKeys(keys)) {
      const where = { flight_id_cabin: { flight_id: key.flightId, cabin: key.cabin } }
      const row = await tx.seat_inventory.findUniqueOrThrow({ where })
      if (action === 'hold') {
        const free = award
          ? Math.min(row.capacity - row.held_count - row.sold_count, row.award_limit - row.award_held_count - row.award_sold_count)
          : cashSeats(row)
        if (count > free) throw new BookingError('SEAT_UNAVAILABLE', 'Not enough seats remain')
      } else {
        const held = action !== 'returnSold'
        const available = held ? row.held_count : row.sold_count
        const awardAvailable = held ? row.award_held_count : row.award_sold_count
        if (count > (award ? awardAvailable : available - awardAvailable)) {
          throw new BookingError('INVALID_BOOKING_STATE', 'Inventory transition exceeds the source count')
        }
      }
      const heldDelta = action === 'hold' ? count : action === 'sell' || action === 'release' ? -count : 0
      const soldDelta = action === 'sell' ? count : action === 'returnSold' ? -count : 0
      try {
        await tx.seat_inventory.update({
          where,
          data: {
            held_count: { increment: heldDelta },
            sold_count: { increment: soldDelta },
            award_held_count: { increment: award ? heldDelta : 0 },
            award_sold_count: { increment: award ? soldDelta : 0 },
            updated_at: this.clock.now(),
          },
        })
      } catch (error) {
        // Prisma adapters wrap PostgreSQL errors differently; match only the named inventory trigger.
        const seen = new Set<unknown>()
        const isOversell = (value: unknown): boolean => {
          if (!value || typeof value !== 'object' || seen.has(value)) return false
          seen.add(value)
          return Object.getOwnPropertyNames(value).some((name) => {
            const item: unknown = (value as Record<string, unknown>)[name]
            return typeof item === 'string' ? item.includes('seat_inventory_no_oversell') : isOversell(item)
          })
        }
        if (isOversell(error)) throw new BookingError('SEAT_UNAVAILABLE', 'Not enough seats remain')
        throw error
      }
    }
  }

  async createForFlight(flightId: string, cabins: InventoryCabin[]): Promise<void> {
    for (const cabin of cabins) {
      nonNegative(cabin.capacity)
      nonNegative(cabin.awardLimit ?? 0)
      if ((cabin.awardLimit ?? 0) > cabin.capacity) throw new BookingError('SEAT_UNAVAILABLE', 'Award limit exceeds cabin capacity')
    }
    await this.db.seat_inventory.createMany({
      data: cabins.map((cabin) => ({
        flight_id: flightId,
        cabin: cabin.cabin,
        capacity: cabin.capacity,
        award_limit: cabin.awardLimit ?? 0,
        updated_at: this.clock.now(),
      })),
      skipDuplicates: true,
    })
  }

  async setCapacity(tx: BookingTransaction, flightId: string, cabin: string, capacity: number): Promise<void> {
    nonNegative(capacity)
    await this.lock(tx, [{ flightId, cabin }])
    const where = { flight_id_cabin: { flight_id: flightId, cabin } }
    const row = await tx.seat_inventory.findUniqueOrThrow({ where })
    const usedAwards = row.award_held_count + row.award_sold_count
    const cashTaken = row.held_count + row.sold_count - usedAwards
    const awardLimit = Math.max(usedAwards, Math.min(row.award_limit, capacity - cashTaken))
    await tx.seat_inventory.update({ where, data: { capacity, award_limit: awardLimit, updated_at: this.clock.now() } })
  }

  async setAwardSeats(flightId: string, cabin: string, count: number): Promise<void> {
    nonNegative(count)
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, [{ flightId, cabin }])
      const where = { flight_id_cabin: { flight_id: flightId, cabin } }
      const row = await tx.seat_inventory.findUniqueOrThrow({ where })
      const limit = Math.max(row.award_held_count + row.award_sold_count, Math.min(row.award_limit, count))
      if (limit !== row.award_limit) {
        await tx.seat_inventory.update({ where, data: { award_limit: limit, updated_at: this.clock.now() } })
      }
    })
  }

  async seatsLeft(flightId: string, cabin: string): Promise<number> {
    const row = await this.db.seat_inventory.findUnique({ where: { flight_id_cabin: { flight_id: flightId, cabin } } })
    return row ? cashSeats(row) : 0
  }

  async availability(flights: FlightAvailabilityRequest[], _party: Party) {
    // Search filters these raw counts against the party size; infants do not consume inventory.
    void _party
    if (!flights.length) return []
    const rows = await this.db.seat_inventory.findMany({
      where: { OR: flights.map((key) => ({ flight_id: key.flightId, cabin: key.cabin })) },
    })
    const counts = new Map(rows.map((row) => [`${row.flight_id}/${row.cabin}`, cashSeats(row)]))
    return flights.map((key) => ({ flightId: key.flightId, cabin: key.cabin, seatsLeft: counts.get(`${key.flightId}/${key.cabin}`) ?? 0 }))
  }
}
