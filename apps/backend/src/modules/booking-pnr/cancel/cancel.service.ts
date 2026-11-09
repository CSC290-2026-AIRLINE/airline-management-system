import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import { BookingStatusService } from '../common/booking-status.service'
import { ReleaseService } from '../confirm/release.service'
import { BookingReadService } from '../manage/booking-read.service'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  INVENTORY_PORT,
  PRICING_PORT,
  REFUND_PORT,
  SEAT_PORT,
  type BookingClock,
  type BookingDetail,
  type BookingEventBus,
  type CancelQuote,
  type InventoryKey,
  type InventoryPort,
  type PricingPort,
  type RefundPort,
  type SeatPort,
} from '../contracts'
import type { CancelBookingResult, CancellationPreview } from './cancel.types'

// A passenger who has reached the airport cannot have the booking cancelled online (D4 guard).
const BLOCKING_CHECK_IN_STATUSES = ['checked_in', 'boarded', 'no_show']

const CANCEL_BOOKING_SELECT = {
  id: true,
  payment_type: true,
  booking_passenger: { select: { id: true, passenger_type: true } },
  booking_segment: { select: { id: true, flight_id: true, cabin: true } },
} satisfies Prisma.bookingSelect

const CANCEL_COUPON_SELECT = {
  id: true,
  flight_id: true,
  booking_passenger_id: true,
  booking_segment_id: true,
  check_in: { select: { status: true } },
} satisfies Prisma.booking_couponSelect

type LockedBooking = Prisma.bookingGetPayload<{ select: typeof CANCEL_BOOKING_SELECT }>
type CancellableCoupon = Prisma.booking_couponGetPayload<{ select: typeof CANCEL_COUPON_SELECT }>

interface InventoryPlan {
  keys: InventoryKey[]
  counts: number[]
}

interface CancelOutcome {
  alreadyClosed: boolean
  status: 'cancelled' | 'expired'
  flightIds: string[]
}

function keyId(flightId: string, cabin: string): string {
  return `${flightId}\u0000${cabin}`
}

@Injectable()
export class CancelService {
  private readonly logger = new Logger(CancelService.name)

  constructor(
    private readonly db: DbService,
    private readonly read: BookingReadService,
    private readonly statusService: BookingStatusService,
    private readonly release: ReleaseService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(SEAT_PORT) private readonly seats: SeatPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(REFUND_PORT) private readonly refunds: RefundPort,
    @Inject(BOOKING_EVENT_BUS) private readonly events: BookingEventBus,
  ) {}

  /** B6: the fee and refund come from Feature 4's cancelQuote; B6 never prices a refund itself. */
  async getPreview(reference: string, userId: string): Promise<CancellationPreview> {
    const detail = await this.loadOwnedBooking(reference, userId)

    if (detail.status === 'held') {
      return { fee: 0, refund: 0, currency: detail.currency, milesReturned: null }
    }
    if (detail.status !== 'confirmed') {
      throw this.invalidState(detail)
    }

    await this.assertNotCheckedIn(detail.bookingId)
    const quote = await this.quoteCancellation(detail)
    return {
      fee: quote.fee,
      refund: quote.refund,
      currency: quote.currency || detail.currency,
      milesReturned: null,
    }
  }

  /**
   * B6: a held booking is released like an abandoned payment; a confirmed booking moves to cancelled, returns the
   * sold seats and leaves the refund to Feature 5b's port. Safe to repeat once the booking is already closed.
   */
  async cancelBooking(reference: string, userId: string): Promise<CancelBookingResult> {
    const detail = await this.loadOwnedBooking(reference, userId)
    const now = this.clock.now()

    if (detail.status === 'held') {
      const released = await this.release.releaseBooking(reference)
      return { reference, status: released.status, fee: 0, refund: 0, currency: detail.currency, milesReturned: null }
    }
    if (detail.status === 'cancelled' || detail.status === 'expired') {
      return { reference, status: detail.status, fee: 0, refund: 0, currency: detail.currency, milesReturned: null }
    }

    await this.assertNotCheckedIn(detail.bookingId)
    const quote = await this.quoteCancellation(detail)

    const outcome = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM booking WHERE booking_reference = ${reference} FOR UPDATE`
      const locked = rows[0]
      if (!locked) {
        throw new NotFoundException(`Booking ${reference} was not found.`)
      }
      if (locked.status === 'cancelled' || locked.status === 'expired') {
        return { alreadyClosed: true, status: locked.status, flightIds: [] } satisfies CancelOutcome
      }
      if (locked.status !== 'confirmed') {
        throw new BookingError('INVALID_BOOKING_STATE', `Booking ${reference} is ${locked.status}.`, 409, {
          status: locked.status,
        })
      }

      const booking = await tx.booking.findUniqueOrThrow({ where: { id: locked.id }, select: CANCEL_BOOKING_SELECT })
      const coupons = await tx.booking_coupon.findMany({
        where: { booking_id: booking.id, status: 'confirmed' },
        select: CANCEL_COUPON_SELECT,
      })
      this.assertNoCheckIn(coupons)

      const plan = this.inventoryPlan(booking, coupons)
      if (plan.keys.length > 0) {
        await this.inventory.lock(tx, plan.keys)
        await this.returnSold(tx, plan.keys, plan.counts, booking.payment_type === 'miles')
      }

      await this.seats.releaseForBooking(tx, booking.id, now)
      await this.statusService.move(tx, { id: booking.id, status: 'confirmed' }, 'cancelled', {
        cancelReason: 'customer_request',
      })

      return {
        alreadyClosed: false,
        status: 'cancelled',
        flightIds: [...new Set(coupons.map((coupon) => coupon.flight_id))],
      } satisfies CancelOutcome
    })

    if (!outcome.alreadyClosed) {
      await this.afterCancel(detail, quote, now, outcome.flightIds)
    }

    return {
      reference,
      status: outcome.status,
      fee: outcome.alreadyClosed ? 0 : quote.fee,
      refund: outcome.alreadyClosed ? 0 : quote.refund,
      currency: quote.currency || detail.currency,
      milesReturned: null,
    }
  }

  private async loadOwnedBooking(reference: string, userId: string): Promise<BookingDetail> {
    const detail = await this.read.getBookingForUser(reference, userId)
    if (!detail) {
      throw new NotFoundException(`Booking ${reference} was not found.`)
    }
    return detail
  }

  private async assertNotCheckedIn(bookingId: string): Promise<void> {
    const blocking = await this.db.check_in.findFirst({
      where: {
        status: { in: BLOCKING_CHECK_IN_STATUSES },
        booking_coupon: { booking_id: bookingId, status: 'confirmed' },
      },
      select: {
        status: true,
        flight_id: true,
        booking_coupon: { select: { id: true } },
      },
    })
    if (!blocking) {
      return
    }

    throw new BookingError('BOOKING_CLOSED', 'This booking can no longer be cancelled because a passenger has already checked in.', 409, {
      status: blocking.status,
      couponId: blocking.booking_coupon.id,
      flightId: blocking.flight_id,
    })
  }

  private assertNoCheckIn(coupons: CancellableCoupon[]): void {
    for (const coupon of coupons) {
      const checkIn = coupon.check_in.find((row) => BLOCKING_CHECK_IN_STATUSES.includes(row.status))
      if (checkIn) {
        throw new BookingError(
          'BOOKING_CLOSED',
          'This booking can no longer be cancelled because a passenger has already checked in.',
          409,
          {
            status: checkIn.status,
            couponId: coupon.id,
            flightId: coupon.flight_id,
          },
        )
      }
    }
  }

  private inventoryPlan(booking: LockedBooking, coupons: CancellableCoupon[]): InventoryPlan {
    const passengerTypes = new Map(booking.booking_passenger.map((passenger) => [passenger.id, passenger.passenger_type]))
    const cabins = new Map(booking.booking_segment.map((segment) => [segment.id, segment.cabin]))
    const keys = new Map<string, InventoryKey>()
    const passengers = new Map<string, Set<string>>()

    for (const coupon of coupons) {
      if (passengerTypes.get(coupon.booking_passenger_id) === 'infant') {
        continue
      }
      const cabin = cabins.get(coupon.booking_segment_id)
      if (!cabin) {
        continue
      }

      const id = keyId(coupon.flight_id, cabin)
      keys.set(id, { flightId: coupon.flight_id, cabin })
      const booked = passengers.get(id) ?? new Set<string>()
      booked.add(coupon.booking_passenger_id)
      passengers.set(id, booked)
    }

    const sortedKeys = [...keys.values()].sort(
      (a, b) => a.flightId.localeCompare(b.flightId) || String(a.cabin).localeCompare(String(b.cabin)),
    )
    return {
      keys: sortedKeys,
      counts: sortedKeys.map((key) => passengers.get(keyId(key.flightId, key.cabin))?.size ?? 0),
    }
  }

  private async returnSold(tx: Prisma.TransactionClient, keys: InventoryKey[], counts: number[], award: boolean): Promise<void> {
    const first = counts[0] ?? 0
    if (counts.every((count) => count === first)) {
      if (first > 0) {
        await this.inventory.returnSold(tx, keys, first, award)
      }
      return
    }

    for (let index = 0; index < keys.length; index++) {
      if (counts[index] > 0) {
        await this.inventory.returnSold(tx, [keys[index]], counts[index], award)
      }
    }
  }

  private quoteCancellation(detail: BookingDetail): Promise<CancelQuote> {
    return this.pricing.cancelQuote({
      bookingId: detail.bookingId,
      couponIds: detail.coupons.filter((coupon) => coupon.status === 'confirmed').map((coupon) => coupon.couponId),
    })
  }

  private async afterCancel(detail: BookingDetail, quote: CancelQuote, now: Date, flightIds: string[]): Promise<void> {
    if (quote.refund > 0) {
      try {
        await this.refunds.record({
          bookingId: detail.bookingId,
          amount: quote.refund,
          currency: quote.currency || detail.currency,
          reason: 'customer_request',
        })
      } catch (error) {
        this.logger.error(`Could not record refund for booking ${detail.reference}`, error as Error)
      }
    }

    try {
      await this.events.publish({
        type: 'booking.cancelled',
        bookingId: detail.bookingId,
        reference: detail.reference,
        customerId: detail.customerId,
        flightIds,
        occurredAt: now,
        cancelReason: 'customer_request',
      })
    } catch (error) {
      this.logger.error(`Could not publish booking.cancelled for ${detail.reference}`, error as Error)
    }
  }

  private invalidState(detail: BookingDetail): BookingError {
    return new BookingError('INVALID_BOOKING_STATE', `Booking ${detail.reference} is ${detail.status}.`, 409, {
      status: detail.status,
    })
  }
}
