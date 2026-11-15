import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { toCents } from '../money'
import type { BookingSeller, ConfirmAnswer, Purchase } from './seller'

/**
 * Feature 3b's side of the checkout, as a stub until 3b ships its BookingService. It READS the booking tables (the
 * getBooking(ref) contract) and answers confirm from the booking's state, but never writes them: moving the booking
 * to confirmed, returning seats and asking feature 11 for miles all belong to 3b. Swap the `BOOKING_SELLER` provider
 * in payments.module.ts for 3b's implementation when it lands.
 */
@Injectable()
export class BookingSellerStub implements BookingSeller {
  readonly sourceFeature = 3 as const
  private readonly logger = new Logger(BookingSellerStub.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  /** getBooking(ref): status, payment type, hold end and the coupons with their price_total. */
  async getBooking(reference: string): Promise<Purchase | null> {
    const booking = await this.db.booking.findUnique({
      where: { booking_reference: reference.trim().toUpperCase() },
      select: {
        id: true,
        booking_reference: true,
        customer_id: true,
        status: true,
        payment_type: true,
        currency: true,
        hold_expires_at: true,
        booking_segment: {
          orderBy: { segment_order: 'asc' },
          select: {
            flight_id: true,
            booking_coupon: {
              where: { status: { not: 'cancelled' } },
              orderBy: { created_at: 'asc' },
              select: {
                id: true,
                price_total: true,
                booking_passenger: { select: { passenger: { select: { first_name: true, last_name: true } } } },
              },
            },
          },
        },
      },
    })
    if (!booking) return null

    const flights = await this.db.flight.findMany({
      where: { id: { in: booking.booking_segment.map((s) => s.flight_id) } },
      select: { id: true, flight_number: true, route: { select: { origin: true, destination: true } } },
    })
    const flightById = new Map(flights.map((f) => [f.id, f]))
    const miles = booking.payment_type === 'miles'
    const lines = booking.booking_segment.flatMap((segment) =>
      segment.booking_coupon.map((coupon) => {
        const person = coupon.booking_passenger.passenger
        const flight = flightById.get(segment.flight_id)
        const leg = flight ? `${flight.flight_number} ${flight.route.origin}-${flight.route.destination}` : 'Flight'
        return {
          lineType: miles ? ('award_fee' as const) : ('fare' as const),
          bookingId: booking.id,
          bookingCouponId: coupon.id,
          description: `${leg} · ${person.first_name} ${person.last_name}${miles ? ' (taxes and carrier charges)' : ''}`,
          amountCents: toCents(coupon.price_total),
        }
      }),
    )

    return {
      sourceFeature: 3,
      purchaseRef: `booking:${booking.id}`,
      customerId: booking.customer_id,
      bookingId: booking.id,
      cargoBookingId: null,
      payable: booking.status === 'held',
      expiresAt: booking.hold_expires_at,
      currency: booking.currency,
      lines,
      milesBooking: miles,
      label: booking.booking_reference,
      cancelPath: `/checkout/${booking.booking_reference}`,
    }
  }

  async confirm(purchaseRef: string): Promise<ConfirmAnswer> {
    const booking = await this.db.booking.findUnique({
      where: { id: purchaseRef.replace(/^booking:/, '') },
      select: {
        status: true,
        hold_expires_at: true,
        booking_segment: { select: { flight_id: true } },
      },
    })
    if (!booking) return { ok: false, code: 'HOLD_EXPIRED', message: 'The booking no longer exists' }
    if (booking.status === 'confirmed') return { ok: true }

    const now = this.clock.now()
    const flights = await this.db.flight.findMany({
      where: { id: { in: booking.booking_segment.map((s) => s.flight_id) } },
      select: { status: true, dep_at: true },
    })
    const notForSale = flights.some((f) => f.status === 'cancelled' || f.dep_at <= now)
    if (notForSale) return { ok: false, code: 'FLIGHT_NOT_FOR_SALE', message: 'A flight in this booking is no longer for sale' }
    // 3b would try to retake the seats of an expired hold; the stub cannot, so a lapsed hold is refused.
    if (booking.status !== 'held' || booking.hold_expires_at <= now) {
      return { ok: false, code: 'HOLD_EXPIRED', message: 'The booking hold has ended' }
    }
    return { ok: true }
  }

  release(purchaseRef: string): Promise<void> {
    this.logger.log(`releaseBooking(${purchaseRef}) — no-op until feature 3b provides it; its hold job covers the rest`)
    return Promise.resolve()
  }

  onCaptured(): Promise<void> {
    return Promise.resolve()
  }
}
