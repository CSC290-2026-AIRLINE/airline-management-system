import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { freeCashSeats, type Cabin } from './domain/upgrade'

/**
 * Feature 3b's `upgradeCoupon(couponId, toCabin)`, which the F11 doc says moves a seat from one cabin to the next in
 * one locked transaction and clears the seat code. Feature 11 depends on this interface only, so when 3b exports its
 * own method, binding LOYALTY_SEAT_PORT to it in LoyaltyModule replaces `InterimSeatUpgrader` without touching the job.
 */
export const LOYALTY_SEAT_PORT = Symbol('LOYALTY_SEAT_PORT')

export type UpgradeOutcome = 'upgraded' | 'no_seat' | 'not_upgradable'

export interface LoyaltySeatPort {
  /** Runs inside the caller's transaction, so the loyalty_benefit_use row commits or rolls back with the move. */
  upgradeCoupon(tx: Prisma.TransactionClient, couponId: string, toCabin: Cabin, now: Date): Promise<UpgradeOutcome>
}

interface SeatRow {
  cabin: string
  capacity: number
  held_count: number
  sold_count: number
  award_limit: number
  award_held_count: number
  award_sold_count: number
}

/**
 * Stand-in for 3b's method until it ships, writing only the rows the doc says the move touches:
 *
 *   - locks both cabins' seat_inventory rows (in cabin order, so two moves never deadlock) and re-checks a free seat;
 *   - moves one sold seat from the old cabin to the new one;
 *   - moves the booking segment to the new cabin, and releases the coupon's seat code (picked again at check-in).
 *
 * The cabin lives on feature 3's booking_segment, not on the coupon, so only a segment with this one seated passenger
 * (a lap infant goes along) can move without moving a companion; any other answers 'not_upgradable'. The segment's
 * fare class belongs to the old cabin (composite foreign key), so it is cleared: TO AGREE with 3b, because an earn row
 * needs a fare class and the upgraded flight then earns no miles.
 */
@Injectable()
export class InterimSeatUpgrader implements LoyaltySeatPort {
  async upgradeCoupon(tx: Prisma.TransactionClient, couponId: string, toCabin: Cabin, now: Date): Promise<UpgradeOutcome> {
    const coupon = await tx.booking_coupon.findUnique({
      where: { id: couponId },
      select: { status: true, flight_id: true, booking_segment_id: true, booking_segment: { select: { cabin: true } } },
    })
    if (!coupon || coupon.status !== 'confirmed') return 'not_upgradable'
    const fromCabin = coupon.booking_segment.cabin

    const rows = await tx.$queryRaw<SeatRow[]>`
      SELECT cabin, capacity, held_count, sold_count, award_limit, award_held_count, award_sold_count
        FROM seat_inventory
       WHERE flight_id = ${coupon.flight_id}::uuid AND cabin IN (${fromCabin}, ${toCabin})
       ORDER BY cabin
         FOR UPDATE`
    const from = rows.find((r) => r.cabin === fromCabin)
    const to = rows.find((r) => r.cabin === toCabin)
    if (!from || !to || from.sold_count < 1) return 'not_upgradable'
    const free = freeCashSeats({
      capacity: to.capacity,
      heldCount: to.held_count,
      soldCount: to.sold_count,
      awardLimit: to.award_limit,
      awardHeldCount: to.award_held_count,
      awardSoldCount: to.award_sold_count,
    })
    if (free < 1) return 'no_seat'

    const seated = await tx.booking_coupon.count({
      where: {
        booking_segment_id: coupon.booking_segment_id,
        status: { in: ['held', 'confirmed'] },
        booking_passenger: { lap_of_id: null },
      },
    })
    if (seated !== 1) return 'not_upgradable'

    const stamp = new Date() // updated_at is real time
    await tx.seat_inventory.update({
      where: { flight_id_cabin: { flight_id: coupon.flight_id, cabin: fromCabin } },
      data: { sold_count: { decrement: 1 }, updated_at: stamp },
    })
    await tx.seat_inventory.update({
      where: { flight_id_cabin: { flight_id: coupon.flight_id, cabin: toCabin } },
      data: { sold_count: { increment: 1 }, updated_at: stamp },
    })
    await tx.booking_segment.update({ where: { id: coupon.booking_segment_id }, data: { cabin: toCabin, fare_class_id: null } })
    await tx.seat_assignment.updateMany({
      where: { booking_coupon_id: couponId, status: { in: ['held', 'assigned'] } },
      data: { status: 'released', released_at: now, updated_at: stamp },
    })
    return 'upgraded'
  }
}
