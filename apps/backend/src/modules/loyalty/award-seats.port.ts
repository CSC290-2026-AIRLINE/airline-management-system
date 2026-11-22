import { HttpStatus, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { LoyaltyError } from './loyalty-error'

export const AWARD_SEAT_PORT = Symbol('AWARD_SEAT_PORT')

/** One cabin's award seats in feature 3's `seat_inventory`. */
export interface AwardInventory {
  capacity: number
  awardLimit: number
  awardHeld: number
  awardSold: number
}

/**
 * The two feature 3b inventory calls Feature 11 needs. Both run inside the caller's transaction, so writing the miles
 * price and setting `award_limit` commit together.
 *
 *   - `lock` takes the cabin's row lock (the same lock 3b takes to hold a seat) and reads the award counts, or null
 *     when the flight has no such cabin.
 *   - `setAwardSeats` sets `award_limit` to `count`; it never goes below the award seats held or sold.
 *
 * Feature 3b's `InventoryPort.setAwardSeats(flightId, cabin, count)` on `feat-03-booking` is still a stub and takes no
 * transaction. Until it lands, `SeatInventoryAwardSeats` below does the same write. Swap the provider for 3b's adapter
 * once it exists (and 3b's signature needs a `tx` for the release to stay one transaction).
 */
export interface AwardSeatPort {
  lock(tx: Prisma.TransactionClient, flightId: string, cabin: string): Promise<AwardInventory | null>
  setAwardSeats(tx: Prisma.TransactionClient, flightId: string, cabin: string, count: number): Promise<void>
}

interface InventoryRow {
  capacity: number
  award_limit: number
  award_held_count: number
  award_sold_count: number
}

/**
 * Interim adapter over `seat_inventory`, until feature 3b ships its own. Touches `award_limit` only; the cash and award
 * held/sold counters stay 3b's. Raising `award_limit` past the unsold seats fails on 3b's `seat_inventory_no_oversell`
 * trigger (SQLSTATE 23514), which the caller maps to 409.
 */
@Injectable()
export class SeatInventoryAwardSeats implements AwardSeatPort {
  async lock(tx: Prisma.TransactionClient, flightId: string, cabin: string): Promise<AwardInventory | null> {
    const rows = await tx.$queryRaw<InventoryRow[]>`
      SELECT capacity, award_limit, award_held_count, award_sold_count
        FROM seat_inventory
       WHERE flight_id = ${flightId}::uuid AND cabin = ${cabin}
         FOR UPDATE`
    const row = rows[0]
    if (!row) return null
    return { capacity: row.capacity, awardLimit: row.award_limit, awardHeld: row.award_held_count, awardSold: row.award_sold_count }
  }

  async setAwardSeats(tx: Prisma.TransactionClient, flightId: string, cabin: string, count: number): Promise<void> {
    const inv = await this.lock(tx, flightId, cabin)
    if (!inv) throw new LoyaltyError(HttpStatus.NOT_FOUND, 'AWARD_CABIN_NOT_FOUND', 'This flight has no such cabin.')
    if (count < inv.awardHeld + inv.awardSold) {
      throw new LoyaltyError(
        HttpStatus.CONFLICT,
        'AWARD_BELOW_TAKEN',
        `Can’t go below the ${inv.awardHeld + inv.awardSold} award seats already redeemed.`,
      )
    }
    if (count === inv.awardLimit) return
    await tx.seat_inventory.update({
      where: { flight_id_cabin: { flight_id: flightId, cabin } },
      data: { award_limit: count, updated_at: new Date() }, // real time, like every updated_at
      select: { flight_id: true },
    })
  }
}
