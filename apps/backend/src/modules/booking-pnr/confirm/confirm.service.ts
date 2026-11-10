import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import { BookingStatusService } from '../common/booking-status.service'
import { AIRLINE_TICKET_NUMBER, nextTicketNumber } from '../common/ticket-number'
import {
  BOOKING_CLOCK,
  BOOKING_EVENT_BUS,
  INVENTORY_PORT,
  PRICING_PORT,
  REFUND_PORT,
  SCREENING_PORT,
  SEAT_PORT,
  type BookingClock,
  type BookingEventBus,
  type ConfirmBookingResult,
  type InventoryKey,
  type InventoryPort,
  type PricingPort,
  type RefundPort,
  type ScreeningPort,
  type SeatPort,
} from '../contracts'

const SELLABLE_FLIGHT_STATUSES = new Set(['scheduled', 'delayed'])

const BOOKING_SELECT = {
  id: true,
  booking_reference: true,
  status: true,
  customer_id: true,
  currency: true,
  payment_type: true,
  hold_expires_at: true,
  confirmed_at: true,
  booking_passenger: { select: { passenger_id: true, passenger_type: true } },
  booking_segment: { select: { flight_id: true, cabin: true } },
} satisfies Prisma.bookingSelect

// The schema has no `booking → booking_coupon` relation (the coupon joins through composite keys), so coupons are read
// by `booking_id` in a second query.
const COUPON_SELECT = {
  fare_quote_id: true,
  price_total: true,
  fare_quote: { select: { promo_code: { select: { code: true } } } },
} satisfies Prisma.booking_couponSelect

interface LoadedBooking {
  id: string
  booking_reference: string
  status: string
  customer_id: string
  currency: string
  payment_type: string
  hold_expires_at: Date
  confirmed_at: Date | null
  booking_passenger: Array<{ passenger_id: string; passenger_type: string }>
  booking_segment: Array<{ flight_id: string; cabin: string }>
}

interface LoadedCoupon {
  fare_quote_id: string | null
  price_total: Prisma.Decimal
  fare_quote: { promo_code: { code: string } | null } | null
}

interface ConfirmOutcome {
  alreadyConfirmed: boolean
  bookingId: string
  confirmedAt: Date
}

// Thrown inside the transaction when an expired hold cannot be sold again, so the transaction rolls back. The refund
// and the HOLD_EXPIRED_REFUNDED answer happen after the rollback, outside the transaction.
class LatePaymentSeatsGoneError extends Error {
  constructor() {
    super('The seats of the expired hold were no longer available.')
    this.name = 'LatePaymentSeatsGoneError'
  }
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
export class ConfirmService {
  private readonly logger = new Logger(ConfirmService.name)

  constructor(
    private readonly db: DbService,
    private readonly statusService: BookingStatusService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(SEAT_PORT) private readonly seats: SeatPort,
    @Inject(REFUND_PORT) private readonly refunds: RefundPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(SCREENING_PORT) private readonly screening: ScreeningPort,
    @Inject(BOOKING_EVENT_BUS) private readonly events: BookingEventBus,
  ) {}

  /**
   * B1/B3: Feature 5a (and Feature 11) call this after the payment is captured. Safe to repeat: a booking that is
   * already confirmed returns the same result and none of the post-commit side effects run a second time. A payment
   * captured after the hold expired tries to sell the seats again (B3); if they are gone, the payment is refunded and
   * the caller gets HOLD_EXPIRED_REFUNDED.
   */
  async confirmBooking(reference: string): Promise<ConfirmBookingResult> {
    const booking = await this.db.booking.findUnique({ where: { booking_reference: reference }, select: BOOKING_SELECT })
    if (!booking) {
      throw new NotFoundException(`Booking ${reference} was not found.`)
    }

    const coupons = await this.db.booking_coupon.findMany({ where: { booking_id: booking.id }, select: COUPON_SELECT })
    const now = this.clock.now()
    const total = coupons.reduce((sum, coupon) => sum + Number(coupon.price_total), 0)

    if (booking.status === 'confirmed') {
      return this.result(booking, total, booking.confirmed_at ?? now)
    }
    if (booking.status === 'cancelled') {
      throw new BookingError('INVALID_BOOKING_STATE', `Booking ${reference} is cancelled.`, 409, { status: booking.status })
    }

    const flightIds = [...new Set(booking.booking_segment.map((segment) => segment.flight_id))]
    await this.assertFlightsForSale(booking.id, flightIds, total, booking.currency)

    const keys = inventoryKeys(booking.booking_segment)
    const count = seatedPassengerCount(booking.booking_passenger)
    const award = booking.payment_type === 'miles'

    const outcome = await this.db
      .$transaction(async (tx): Promise<ConfirmOutcome> => {
        const rows = await tx.$queryRaw<Array<{ id: string; status: string; confirmed_at: Date | null }>>`
          SELECT id, status, confirmed_at FROM booking WHERE booking_reference = ${reference} FOR UPDATE`
        const locked = rows[0]
        if (!locked) {
          throw new NotFoundException(`Booking ${reference} was not found.`)
        }
        if (locked.status === 'confirmed') {
          return { alreadyConfirmed: true, bookingId: locked.id, confirmedAt: locked.confirmed_at ?? now }
        }
        if (locked.status !== 'held' && locked.status !== 'expired') {
          throw new BookingError('INVALID_BOOKING_STATE', `Booking ${reference} is ${locked.status}.`, 409, {
            status: locked.status,
          })
        }

        await this.inventory.lock(tx, keys)
        if (locked.status === 'expired') {
          try {
            await this.inventory.sell(tx, keys, count, award)
          } catch {
            // Roll back, then refund outside the transaction and answer HOLD_EXPIRED_REFUNDED (B3).
            throw new LatePaymentSeatsGoneError()
          }
        } else {
          await this.inventory.sell(tx, keys, count, award)
        }
        await this.statusService.move(tx, { id: locked.id, status: locked.status }, 'confirmed', {
          issueTicket: () => nextTicketNumber(tx, AIRLINE_TICKET_NUMBER),
        })
        await this.seats.assignHeldForBooking(tx, locked.id, now)

        return { alreadyConfirmed: false, bookingId: locked.id, confirmedAt: now }
      })
      .catch(async (error: unknown): Promise<never> => {
        if (!(error instanceof LatePaymentSeatsGoneError)) {
          throw error
        }
        if (total > 0) {
          await this.refunds.record({
            bookingId: booking.id,
            amount: total,
            currency: booking.currency,
            reason: 'hold_expired',
          })
        }
        throw new BookingError(
          'HOLD_EXPIRED_REFUNDED',
          `Booking ${reference} expired and its seats were no longer available; the payment has been refunded.`,
          409,
          { status: 'expired' },
        )
      })

    if (!outcome.alreadyConfirmed) {
      await this.afterConfirm(booking, coupons, now)
    }

    return {
      bookingId: outcome.bookingId,
      reference: booking.booking_reference,
      status: 'confirmed',
      total,
      holdExpiresAt: booking.hold_expires_at,
      confirmedAt: outcome.confirmedAt,
    }
  }

  private async assertFlightsForSale(bookingId: string, flightIds: string[], total: number, currency: string): Promise<void> {
    const flights = await this.db.flight.findMany({ where: { id: { in: flightIds } }, select: { id: true, status: true } })
    const forSale = flights.length === flightIds.length && flights.every((flight) => SELLABLE_FLIGHT_STATUSES.has(flight.status))
    if (forSale) {
      return
    }

    await this.refunds.record({ bookingId, amount: total, currency, reason: 'flight_not_for_sale' })
    throw new BookingError('FLIGHT_NOT_FOR_SALE', 'The flight is no longer for sale.', 409, { flightIds })
  }

  private async afterConfirm(booking: LoadedBooking, coupons: LoadedCoupon[], now: Date): Promise<void> {
    await this.redeemPromoCodes(coupons)

    const passengerIds = [...new Set(booking.booking_passenger.map((passenger) => passenger.passenger_id))]
    try {
      await this.screening.screen({ passengerIds })
    } catch (error) {
      this.logger.error(`Screening failed for booking ${booking.booking_reference}`, error as Error)
    }

    try {
      await this.db.customer_passenger.updateMany({
        where: { customer_id: booking.customer_id, passenger_id: { in: passengerIds } },
        data: { last_booked_at: now, updated_at: new Date() },
      })
    } catch (error) {
      this.logger.error(`Could not record last_booked_at for booking ${booking.booking_reference}`, error as Error)
    }

    try {
      await this.events.publish({
        type: 'booking.confirmed',
        bookingId: booking.id,
        reference: booking.booking_reference,
        customerId: booking.customer_id,
        flightIds: [...new Set(booking.booking_segment.map((segment) => segment.flight_id))],
        occurredAt: now,
      })
    } catch (error) {
      this.logger.error(`Could not publish booking.confirmed for ${booking.booking_reference}`, error as Error)
    }
  }

  private async redeemPromoCodes(coupons: LoadedCoupon[]): Promise<void> {
    const quotes = new Map<string, string>()
    for (const coupon of coupons) {
      const code = coupon.fare_quote?.promo_code?.code
      if (coupon.fare_quote_id && code) {
        quotes.set(coupon.fare_quote_id, code)
      }
    }

    for (const [fareQuoteId, promoCode] of quotes) {
      try {
        await this.pricing.redeem(promoCode, fareQuoteId)
      } catch (error) {
        this.logger.error(`Could not redeem promo ${promoCode} for quote ${fareQuoteId}`, error as Error)
      }
    }
  }

  private result(booking: LoadedBooking, total: number, confirmedAt: Date): ConfirmBookingResult {
    return {
      bookingId: booking.id,
      reference: booking.booking_reference,
      status: 'confirmed',
      total,
      holdExpiresAt: booking.hold_expires_at,
      confirmedAt,
    }
  }
}
