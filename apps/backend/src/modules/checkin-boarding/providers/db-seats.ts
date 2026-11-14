import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import type { Cabin, SeatLock, SeatMap, SeatStatus, SeatType } from '../api-types'
import { CheckInError } from '../errors'
import type { Numeric } from '../store/prisma-mappers'
import { SEAT_LAYOUT, SEAT_LIST, seatOf } from './fixtures'
import { CLOCK, SEAT_FEE_TYPE } from './providers'
import type { ClockProvider, SeatProvider } from './providers'

interface SeatRow {
  id: string
  booking_coupon_id: string
  flight_id: string
  seat_code: string
  status: string
  hold_expires_at: Date | null
  fee_amount: Numeric
  payment_id: string | null
}

interface CouponRow {
  id: string
  booking_passenger_id: string
  flight_id: string
  booking_segment: { cabin: string }
}

const COUPON_INCLUDE = { booking_segment: { select: { cabin: true } } } as const

const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const toCabin = (value: string): Cabin => (CABINS.includes(value as Cabin) ? (value as Cabin) : 'economy')

/** The seat of the aircraft is a fixture; the database only says who sits where. */
@Injectable()
export class DbSeats implements SeatProvider {
  constructor(
    private readonly db: DbService,
    @Inject(CLOCK) private readonly clock: ClockProvider,
  ) {}

  async seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }): Promise<SeatMap> {
    const live = await this.liveRows(flightId)
    const mine = viewer.bookingPassengerId ? await this.couponOf(viewer.bookingPassengerId, flightId) : null
    const fees = await this.feeRows()
    const rows: SeatMap['rows'] = []

    for (const seat of SEAT_LIST) {
      let row = rows.find((r) => r.row === seat.row)
      if (!row) {
        row = { row: seat.row, exitRow: SEAT_LAYOUT.exitRows.includes(seat.row), seats: [] }
        rows.push(row)
      }
      row.seats.push({
        code: seat.code,
        row: seat.row,
        letter: seat.letter,
        cabin: seat.cabin,
        type: seat.type,
        status: this.statusOf(seat.code, seat.cabin, viewer, mine, live),
        fee: this.feeOf(fees, seat.cabin, seat.type),
      })
    }
    return { flightId, rows }
  }

  async hold(flightId: string, seatCode: string, bookingPassengerId: string, ttlMs: number): Promise<SeatLock> {
    const seat = seatOf(seatCode)
    if (!seat) throw new CheckInError(400, 'VALIDATION', `Seat ${seatCode} does not exist`)
    const coupon = await this.couponOf(bookingPassengerId, flightId)
    if (!coupon) throw new CheckInError(404, 'NOT_FOUND', 'Booking not found')
    if (seat.cabin !== toCabin(coupon.booking_segment.cabin)) {
      throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is not in your cabin`, { seatCode })
    }

    const fee = await this.feeOfRow(seat.cabin, seat.type)
    const now = this.clock.now()
    const expiresAt = new Date(now.getTime() + ttlMs)
    try {
      const row = await this.db.$transaction(async (tx) => {
        // The passenger keeps the seat they have: only the earlier hold is given back before the new one is written.
        await tx.seat_assignment.updateMany({
          where: { booking_coupon_id: coupon.id, status: 'held' },
          data: { status: 'released', released_at: now, updated_at: now },
        })
        // An expired hold still sits in the unique index of the free seats, so it is swept away first.
        await this.sweepExpired(tx, flightId, seatCode, now)
        return tx.seat_assignment.create({
          data: {
            booking_coupon_id: coupon.id,
            flight_id: flightId,
            seat_code: seatCode,
            status: 'held',
            hold_expires_at: expiresAt,
            fee_amount: fee,
            payment_id: null,
          },
        })
      })
      return {
        id: row.id,
        flightId,
        seatCode,
        expiresAt: expiresAt.toISOString(),
        fee,
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CheckInError(409, 'SEAT_TAKEN', `Seat ${seatCode} is not available`, { seatCode })
      }
      throw error
    }
  }

  async lock(lockId: string): Promise<(SeatLock & { bookingPassengerId: string }) | null> {
    const row = await this.db.seat_assignment.findUnique({
      where: { id: lockId },
      include: { booking_coupon: { select: { booking_passenger_id: true } } },
    })
    if (!row || row.status !== 'held' || !row.hold_expires_at) return null
    return {
      id: row.id,
      flightId: row.flight_id,
      seatCode: row.seat_code,
      expiresAt: row.hold_expires_at.toISOString(),
      fee: Number(row.fee_amount),
      bookingPassengerId: row.booking_coupon.booking_passenger_id,
    }
  }

  async release(lockId: string): Promise<void> {
    const now = this.clock.now()
    await this.db.seat_assignment.updateMany({
      where: { id: lockId, status: 'held' },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  }

  async confirm(lockId: string, paymentId: string | null): Promise<{ seatCode: string; type: SeatType }> {
    const row = await this.db.seat_assignment.findUnique({ where: { id: lockId } })
    if (!row) throw new CheckInError(404, 'NOT_FOUND', `Seat hold ${lockId} not found`)
    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      // The seat the passenger had is given back only when the new one is confirmed.
      await tx.seat_assignment.updateMany({
        where: { booking_coupon_id: row.booking_coupon_id, status: 'assigned', id: { not: lockId } },
        data: { status: 'released', released_at: now, updated_at: now },
      })
      // Only a live hold becomes an assigned seat: a row that was taken or that ran out is not confirmed.
      const updated = await tx.seat_assignment.updateMany({
        where: { id: lockId, status: 'held', hold_expires_at: { gt: now } },
        data: { status: 'assigned', assigned_at: now, payment_id: paymentId, updated_at: now },
      })
      if (updated.count === 0) {
        throw new CheckInError(409, 'LOCK_EXPIRED', 'The seat hold has expired', { seatCode: row.seat_code })
      }
    })
    return { seatCode: row.seat_code, type: seatOf(row.seat_code)?.type ?? 'standard' }
  }

  async assigned(bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType; paymentId: string | null } | null> {
    const row = await this.db.seat_assignment.findFirst({
      where: { booking_coupon: { booking_passenger_id: bookingPassengerId }, status: 'assigned' },
    })
    return row ? { seatCode: row.seat_code, type: seatOf(row.seat_code)?.type ?? 'standard', paymentId: row.payment_id } : null
  }

  async assignAnyStandard(
    flightId: string,
    bookingPassengerId: string,
    opts: { avoidExitRow: boolean },
  ): Promise<{ seatCode: string; type: SeatType }> {
    const coupon = await this.couponOf(bookingPassengerId, flightId)
    if (!coupon) throw new CheckInError(404, 'NOT_FOUND', 'Booking not found')
    const cabin = toCabin(coupon.booking_segment.cabin)
    const live = await this.liveRows(flightId)
    const free = SEAT_LIST.filter((seat) => seat.cabin === cabin && !live.some((row) => row.seat_code === seat.code))
    // A standard seat first; an exit row only when the passenger may have one and nothing else is left.
    const candidates = [
      ...free.filter((s) => s.type === 'standard' || s.type === 'business'),
      ...(opts.avoidExitRow ? [] : free.filter((s) => s.type === 'exit')),
    ]
    if (candidates.length === 0) throw new CheckInError(409, 'SEAT_TAKEN', 'No free seat left on this flight')

    const now = this.clock.now()
    for (const seat of candidates) {
      try {
        await this.db.$transaction(async (tx) => {
          // The passenger keeps one seat: the earlier hold is given back before the new one is written.
          await tx.seat_assignment.updateMany({
            where: { booking_coupon_id: coupon.id, status: { in: ['held', 'assigned'] } },
            data: { status: 'released', released_at: now, updated_at: now },
          })
          await this.sweepExpired(tx, flightId, seat.code, now)
          await tx.seat_assignment.create({
            data: {
              booking_coupon_id: coupon.id,
              flight_id: flightId,
              seat_code: seat.code,
              status: 'assigned',
              assigned_at: now,
              fee_amount: 0,
              payment_id: null,
            },
          })
        })
        return { seatCode: seat.code, type: seat.type }
      } catch (error) {
        // Another passenger took the seat between the map and the write: the next free seat is tried.
        if (!isUniqueViolation(error)) throw error
      }
    }
    throw new CheckInError(409, 'SEAT_TAKEN', 'No free seat left on this flight')
  }

  async releaseAssigned(bookingPassengerId: string): Promise<void> {
    const now = this.clock.now()
    await this.db.seat_assignment.updateMany({
      where: { booking_coupon: { booking_passenger_id: bookingPassengerId }, status: { in: ['held', 'assigned'] } },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  }

  /** The rows that still hold a seat: an assigned one and a hold that has not run out. */
  private async liveRows(flightId: string): Promise<SeatRow[]> {
    const rows = await this.db.seat_assignment.findMany({ where: { flight_id: flightId } })
    const now = this.clock.now().getTime()
    return rows.filter((row) => row.status === 'assigned' || (row.status === 'held' && (row.hold_expires_at?.getTime() ?? 0) > now))
  }

  /** A hold that ran out still sits in the unique index of the free seats: it is given back there. */
  private async sweepExpired(tx: Prisma.TransactionClient, flightId: string, seatCode: string, now: Date): Promise<void> {
    await tx.seat_assignment.updateMany({
      where: { flight_id: flightId, seat_code: seatCode, status: 'held', hold_expires_at: { lte: now } },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  }

  private async couponOf(bookingPassengerId: string, flightId: string): Promise<CouponRow | null> {
    const row = await this.db.booking_coupon.findFirst({
      where: { booking_passenger_id: bookingPassengerId, flight_id: flightId },
      include: COUPON_INCLUDE,
    })
    return row
  }

  private statusOf(
    seatCode: string,
    cabin: Cabin,
    viewer: { bookingPassengerId: string | null; cabin: Cabin | null },
    mine: CouponRow | null,
    live: SeatRow[],
  ): SeatStatus {
    if (mine && live.some((row) => row.booking_coupon_id === mine.id && row.seat_code === seatCode)) return 'mine'
    if (live.some((row) => row.seat_code === seatCode)) return 'taken'
    if (viewer.cabin && cabin !== viewer.cabin) return 'blocked'
    return 'free'
  }

  private async feeRows(): Promise<Array<{ cabin: string; seat_type: string; amount: Numeric }>> {
    const rows = await this.db.seat_fee.findMany({ where: { deleted_at: null } })
    return rows
  }

  private feeOf(rows: Array<{ cabin: string; seat_type: string; amount: Numeric }>, cabin: Cabin, type: SeatType): number {
    const row = rows.find((r) => r.cabin === cabin && r.seat_type === SEAT_FEE_TYPE[type])
    return row ? Number(row.amount) : 0
  }

  private async feeOfRow(cabin: Cabin, type: SeatType): Promise<number> {
    const row = await this.db.seat_fee.findFirst({ where: { cabin, seat_type: SEAT_FEE_TYPE[type], deleted_at: null } })
    return row ? Number(row.amount) : 0
  }
}

/** The two unique indexes of `seat_assignment` both answer P2002 when the seat is gone. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
