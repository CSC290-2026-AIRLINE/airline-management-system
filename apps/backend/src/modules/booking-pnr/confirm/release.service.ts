import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import { BookingStatusService } from '../common/booking-status.service'
import {
  BOOKING_CLOCK,
  INVENTORY_PORT,
  SEAT_PORT,
  type BookingClock,
  type BookingTransaction,
  type InventoryKey,
  type InventoryPort,
  type ReleaseBookingResult,
  type SeatPort,
} from '../contracts'

const RELEASE_SELECT = {
  id: true,
  booking_reference: true,
  status: true,
  payment_type: true,
  booking_passenger: { select: { passenger_type: true } },
  booking_segment: { select: { flight_id: true, cabin: true } },
} satisfies Prisma.bookingSelect

type ReleasableBooking = {
  id: string
  payment_type: string
  booking_passenger: Array<{ passenger_type: string }>
  booking_segment: Array<{ flight_id: string; cabin: string }>
}

function inventoryKeys(segments: Array<{ flight_id: string; cabin: string }>): InventoryKey[] {
  const keys = new Map<string, InventoryKey>()
  for (const segment of segments) {
    keys.set(`${segment.flight_id}\u0000${segment.cabin}`, { flightId: segment.flight_id, cabin: segment.cabin })
  }
  return [...keys.values()].sort((a, b) => a.flightId.localeCompare(b.flightId) || String(a.cabin).localeCompare(String(b.cabin)))
}

function seatedPassengerCount(passengers: Array<{ passenger_type: string }>): number {
  return passengers.filter((passenger) => passenger.passenger_type !== 'infant').length
}

@Injectable()
export class ReleaseService {
  private readonly logger = new Logger(ReleaseService.name)

  constructor(
    private readonly db: DbService,
    private readonly statusService: BookingStatusService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(SEAT_PORT) private readonly seats: SeatPort,
  ) {}

  /** B2: Feature 5a calls this when the customer abandons payment, and B6 on a held cancel. Safe to repeat. */
  async releaseBooking(reference: string): Promise<ReleaseBookingResult> {
    const now = this.clock.now()
    const outcome = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM booking WHERE booking_reference = ${reference} FOR UPDATE`
      const locked = rows[0]
      if (!locked) {
        throw new NotFoundException(`Booking ${reference} was not found.`)
      }
      if (locked.status === 'expired') {
        return { bookingId: locked.id, released: false }
      }
      if (locked.status !== 'held') {
        throw new BookingError('INVALID_BOOKING_STATE', `Booking ${reference} is ${locked.status}.`, 409, { status: locked.status })
      }

      const booking = await tx.booking.findUniqueOrThrow({ where: { id: locked.id }, select: RELEASE_SELECT })
      await this.performRelease(tx, booking, now)
      return { bookingId: booking.id, released: true }
    })

    if (outcome.released) {
      this.logger.log(`Released hold ${reference}`)
    }
    return { bookingId: outcome.bookingId, reference, status: 'expired' }
  }

  /**
   * B2 expiry job body. Locks a batch of stale holds with FOR UPDATE SKIP LOCKED, so a second instance (or a
   * concurrent confirm) can never release or sell the same booking twice.
   */
  async releaseStale(batchSize = 100): Promise<number> {
    const now = this.clock.now()
    const released = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; booking_reference: string }>>`
        SELECT id, booking_reference FROM booking
        WHERE status = 'held' AND hold_expires_at <= ${now}
        ORDER BY hold_expires_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`

      let count = 0
      for (const row of rows) {
        const booking = await tx.booking.findUnique({ where: { id: row.id }, select: RELEASE_SELECT })
        if (!booking || booking.status !== 'held') {
          continue
        }
        await this.performRelease(tx, booking, now)
        count++
      }
      return count
    })

    if (released > 0) {
      this.logger.log(`Released ${released} stale hold(s)`)
    }
    return released
  }

  private async performRelease(tx: BookingTransaction, booking: ReleasableBooking, now: Date): Promise<void> {
    const keys = inventoryKeys(booking.booking_segment)
    const count = seatedPassengerCount(booking.booking_passenger)
    const award = booking.payment_type === 'miles'

    await this.inventory.lock(tx, keys)
    await this.inventory.release(tx, keys, count, award)
    await this.seats.releaseForBooking(tx, booking.id, now)
    await this.statusService.move(tx, { id: booking.id, status: 'held' }, 'expired')
  }
}
