import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { booking } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import { insertWithBookingReference, isUniqueConstraintError } from '../common/booking-reference'
import {
  BOOKING_CLOCK,
  INVENTORY_PORT,
  PRICING_PORT,
  SEAT_PORT,
  SEAT_MAP_PORT,
  SERVICE_REQUEST_PORT,
  type BookingClock,
  type BookingTransaction,
  type InventoryPort,
  type PricingPort,
  type SeatPort,
  type ServiceRequestPort,
  type SeatMapPort,
  type FareQuote,
} from '../contracts'
import type { HoldBookingDto, HoldBookingResponse } from './dto/hold-booking.dto'
import { invalidHold, validateHoldFlights, validateHoldPassengers } from './hold.validation'

@Injectable()
export class HoldService {
  constructor(
    private readonly db: DbService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    @Inject(PRICING_PORT) private readonly pricing: PricingPort,
    @Inject(SEAT_PORT) private readonly seats: SeatPort,
    @Inject(SERVICE_REQUEST_PORT) private readonly requests: ServiceRequestPort,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(SEAT_MAP_PORT) private readonly layouts: SeatMapPort,
  ) {}

  private requireKey(key: string | undefined): string {
    if (!key?.trim() || key.length > 200)
      throw new BookingError('INVALID_BOOKING_STATE', 'Idempotency-Key is required (maximum 200 characters)', 400)
    return key.trim()
  }

  async createForUser(userId: string, key: string | undefined, request: HoldBookingDto): Promise<HoldBookingResponse> {
    const normalizedKey = this.requireKey(key)
    const customer = await this.db.customer.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!customer) throw new BookingError('INVALID_BOOKING_STATE', 'A customer account is required to book', 403)
    return this.create(customer.id, null, normalizedKey, request)
  }

  async createForStaff(userId: string, customerId: string, key: string | undefined, request: HoldBookingDto): Promise<HoldBookingResponse> {
    const normalizedKey = this.requireKey(key)
    // Feature-local staff membership check until the platform supplies its shared staff guard.
    // The actor always comes from the existing JWT guard, never from request-body fields.
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    if (!staff) throw new BookingError('INVALID_BOOKING_STATE', 'An active staff account is required', 403)
    const customer = await this.db.customer.findFirst({
      where: { id: customerId, deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    if (!customer) throw new BookingError('INVALID_BOOKING_STATE', 'Customer not found', 404)
    return this.create(customer.id, staff.id, normalizedKey, request)
  }

  private async create(customerId: string, staffId: string | null, key: string, request: HoldBookingDto): Promise<HoldBookingResponse> {
    try {
      return await insertWithBookingReference(
        (reference) => this.db.$transaction((tx) => this.hold(tx, customerId, key, reference, request, staffId), { timeout: 15000 }),
        (error) => isUniqueConstraintError(error) && JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes('booking_reference'),
      )
    } catch (error) {
      if (isUniqueConstraintError(error) && JSON.stringify((error as { meta?: unknown }).meta ?? {}).includes('booking_coupon_person_uq'))
        throw new BookingError('INVALID_BOOKING_STATE', 'A passenger already has an active booking on a selected flight')
      if (isUniqueConstraintError(error)) throw new BookingError('SEAT_UNAVAILABLE', 'A selected seat is no longer available')
      throw error
    }
  }
  private async hold(
    tx: BookingTransaction,
    customerId: string,
    key: string,
    reference: string,
    request: HoldBookingDto,
    staffId: string | null,
  ): Promise<HoldBookingResponse> {
    // Serialize retries for the same customer/key before any inventory decision, including the last-seat race.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${customerId}:${key}`}, 0))`
    const existing = await tx.booking.findUnique({
      where: { customer_id_idempotency_key: { customer_id: customerId, idempotency_key: key } },
    })
    if (existing) {
      const totals = await tx.booking_coupon.aggregate({ where: { booking_id: existing.id }, _sum: { price_total: true } })
      return this.response(existing, Number(totals._sum.price_total ?? 0))
    }
    if (request.paymentType !== 'cash') invalidHold('Miles bookings are not enabled yet')
    if (request.segments.some((segment) => !segment.fareClassId)) invalidHold('Cash bookings require a fare class on every segment')
    // Keep the assigned aircraft stable while pricing its seats and writing their holds. Scheduling can change it
    // after commit; the aircraft-change receipt then releases any seats invalid on the replacement aircraft.
    await tx.$executeRaw`SELECT id FROM flight WHERE id = ANY(${request.segments.map((segment) => segment.flightId)}::uuid[]) ORDER BY id FOR SHARE`
    const flightRows = await tx.flight.findMany({
      where: { id: { in: request.segments.map((segment) => segment.flightId) } },
      include: { route: true },
    })
    const flights = validateHoldFlights(request, flightRows, this.clock.now())
    const passengerRows = await tx.passenger.findMany({
      where: { id: { in: request.passengers.map((person) => person.passengerId) }, deleted_at: null },
    })
    const types = validateHoldPassengers(request, passengerRows, flights)
    const fareClasses = await tx.fare_class.findMany({
      where: { id: { in: request.segments.map((segment) => segment.fareClassId!) }, deleted_at: null, is_active: true },
    })
    for (const segment of request.segments) {
      if (!fareClasses.some((fare) => fare.id === segment.fareClassId && fare.cabin === segment.cabin))
        invalidHold('Fare class does not match the selected cabin')
    }
    const passengerCount = [...types.values()].filter((type) => type !== 'infant').length
    const layoutByFlight = new Map(
      await Promise.all(
        [...new Set(request.segments.map((segment) => segment.flightId))].map(
          async (id) => [id, await this.layouts.getSeatMap(id)] as const,
        ),
      ),
    )
    if (
      request.segments.some(
        (segment) => !layoutByFlight.get(segment.flightId)?.cabins.some((cabin) => cabin.cabin === segment.cabin && cabin.capacity > 0),
      )
    )
      throw new BookingError('FARE_UNAVAILABLE', 'The selected cabin is not available on this aircraft', 409)
    // Price each passenger's actual seat. Reuse identical quotes within this hold, but keep different seat types on
    // distinct coupon quotes so discounts, taxes and cancellation rules come from the pricing owner.
    const quoteCache = new Map<string, Promise<FareQuote>>()
    const priced = await Promise.all(
      request.passengers
        .filter((person) => types.get(person.passengerId) !== 'infant')
        .flatMap((person) =>
          request.segments.map(async (segment) => {
            const choice = request.seats?.find((seat) => seat.passengerId === person.passengerId && seat.flightId === segment.flightId)
            const seat = choice
              ? layoutByFlight
                  .get(segment.flightId)
                  ?.rows.flatMap((row) => row.seats)
                  .find((item) => item.seatCode === choice.seatCode)
              : undefined
            if (choice && (!seat || seat.blocked || seat.cabin !== segment.cabin))
              throw new BookingError('SEAT_NOT_ALLOWED', 'Seat does not match the selected cabin', 422)
            const cacheKey = `${segment.flightId}:${segment.fareClassId}:${seat?.type ?? ''}`
            let pending = quoteCache.get(cacheKey)
            if (!pending) {
              pending = this.pricing.quote({
                flightId: segment.flightId,
                cabin: segment.cabin,
                fareClassId: segment.fareClassId!,
                promoCode: request.promoCode,
                ...(seat ? { seatType: seat.type } : {}),
              })
              quoteCache.set(cacheKey, pending)
            }
            const quote = await pending
            if (quote.fareClassId !== segment.fareClassId || !Number.isFinite(quote.pricePerPassenger) || quote.pricePerPassenger < 0)
              invalidHold('Pricing returned an invalid quote')
            return { key: `${person.passengerId}:${segment.flightId}`, quote }
          }),
        ),
    )
    const currency = priced[0]?.quote.currency
    if (!currency || !/^[A-Z]{3}$/.test(currency) || priced.some(({ quote }) => quote.currency !== currency))
      invalidHold('Pricing returned an invalid quote')
    const quotes = new Map(priced.map(({ key, quote }) => [key, quote]))
    const total = priced.reduce((sum, { quote }) => sum + Math.round(quote.pricePerPassenger * 100), 0) / 100
    if (Math.round(request.expectedTotal * 100) !== Math.round(total * 100)) {
      throw new BookingError('PRICE_CHANGED', 'The itinerary price has changed', 409, {
        previousTotal: request.expectedTotal,
        newTotal: total,
        currency,
      })
    }
    const keys = request.segments.map((segment) => ({ flightId: segment.flightId, cabin: segment.cabin }))
    await this.inventory.lock(tx, keys)
    await this.inventory.hold(tx, keys, passengerCount)
    const bookedAt = this.clock.now()
    validateHoldFlights(request, flights, bookedAt)
    const expiresAt = new Date(bookedAt.getTime() + 15 * 60000)
    const booking = await tx.booking.create({
      data: {
        booking_reference: reference,
        customer_id: customerId,
        booked_by_staff_id: staffId,
        trip_type: request.tripType,
        status: 'held',
        payment_type: 'cash',
        currency,
        contact_email: request.contactEmail,
        contact_phone: request.contactPhone ?? null,
        idempotency_key: key,
        booked_at: bookedAt,
        hold_expires_at: expiresAt,
        updated_at: bookedAt,
      },
    })
    const passengerIds = new Map(request.passengers.map((person) => [person.passengerId, randomUUID()]))
    await tx.booking_passenger.createMany({
      data: request.passengers.map((person) => ({
        id: passengerIds.get(person.passengerId)!,
        booking_id: booking.id,
        passenger_id: person.passengerId,
        passenger_type: types.get(person.passengerId)!,
        lap_of_id: person.lapOfPassengerId ? passengerIds.get(person.lapOfPassengerId)! : null,
      })),
    })
    const segments = request.segments.map((segment, index) => ({
      id: randomUUID(),
      booking_id: booking.id,
      flight_id: segment.flightId,
      segment_order: index + 1,
      cabin: segment.cabin,
      fare_class_id: segment.fareClassId,
    }))
    await tx.booking_segment.createMany({ data: segments })
    const coupons = request.passengers.flatMap((person) =>
      segments.map((segment) => ({
        id: randomUUID(),
        booking_id: booking.id,
        booking_segment_id: segment.id,
        booking_passenger_id: passengerIds.get(person.passengerId)!,
        flight_id: segment.flight_id,
        passenger_id: person.passengerId,
        fare_quote_id: quotes.get(`${person.passengerId}:${segment.flight_id}`)?.fareQuoteId ?? null,
        price_total: (Math.round((quotes.get(`${person.passengerId}:${segment.flight_id}`)?.pricePerPassenger ?? 0) * 100) / 100).toFixed(
          2,
        ),
        status: 'held',
        updated_at: bookedAt,
      })),
    )
    await tx.booking_coupon.createMany({ data: coupons })
    // Assistance is created before seats so C can enforce exit-row restrictions against it.
    await this.requests.createForHold(
      tx,
      (request.serviceRequests ?? []).map((service) => ({
        bookingId: booking.id,
        bookingPassengerId: passengerIds.get(service.passengerId)!,
        bookingSegmentId: service.flightId ? segments.find((segment) => segment.flight_id === service.flightId)!.id : null,
        serviceCode: service.serviceCode,
        note: service.note,
        requestedAt: bookedAt,
      })),
    )
    await this.seats.holdForBooking(
      tx,
      booking.id,
      (request.seats ?? []).map((seat) => ({
        bookingCouponId: coupons.find((coupon) => coupon.passenger_id === seat.passengerId && coupon.flight_id === seat.flightId)!.id,
        flightId: seat.flightId,
        seatCode: seat.seatCode,
      })),
      expiresAt,
    )
    return this.response(booking, total)
  }

  private response(booking: booking, total: number): HoldBookingResponse {
    return {
      bookingId: booking.id,
      reference: booking.booking_reference,
      total,
      currency: booking.currency,
      holdExpiresAt: booking.hold_expires_at.toISOString(),
    }
  }
}
