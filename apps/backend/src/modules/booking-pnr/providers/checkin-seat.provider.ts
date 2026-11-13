import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { BookingError } from '../common/booking-error'
import { BOOKING_CLOCK, CHECKOUT_PORT, SEAT_MAP_PORT, type BookingClock, type SeatMapPort, type CheckoutPort } from '../contracts'
import { CheckinSeatMapAdapter } from './checkin-seat-map.adapter'
import type { Cabin, SeatLock, SeatProvider, SeatType } from './feature6.types'

@Injectable()
export class CheckinSeatProvider implements SeatProvider {
  constructor(
    private readonly db: DbService,
    private readonly maps: CheckinSeatMapAdapter,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
    @Inject(SEAT_MAP_PORT) private readonly layouts: SeatMapPort,
    private readonly audit: AuditService,
    @Inject(CHECKOUT_PORT) private readonly checkout: CheckoutPort,
  ) {}

  seatMap(flightId: string, viewer: { bookingPassengerId: string | null; cabin: Cabin | null }) {
    return this.maps.seatMap(flightId, viewer)
  }

  async hold(
    flightId: string,
    seatCode: string,
    bookingPassengerId: string,
    ttlMs: number,
    options: { rejectCheckedIn?: boolean } = {},
  ): Promise<SeatLock> {
    if (!/^[1-9][0-9]?[A-Z]$/.test(seatCode) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new BookingError('SEAT_NOT_ALLOWED', 'Invalid seat or hold duration')
    }
    const coupon = await this.db.booking_coupon.findFirst({
      where: { flight_id: flightId, booking_passenger_id: bookingPassengerId, status: 'confirmed' },
      include: { booking_segment: true, booking_passenger: { include: { other_booking_passenger: true, booking_service_request: true } } },
    })
    if (!coupon) throw new NotFoundException('Confirmed booking for this flight not found')
    const passenger = coupon.booking_passenger
    const layout = await this.layouts.getSeatMap(flightId)
    const seat = layout.rows.flatMap((row) => row.seats).find((item) => item.seatCode === seatCode)
    if (!seat || seat.blocked || seat.cabin !== coupon.booking_segment.cabin || passenger.passenger_type === 'infant') {
      throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is not allowed for this passenger')
    }
    if (
      seat.type === 'exit' &&
      (passenger.passenger_type !== 'adult' ||
        passenger.other_booking_passenger ||
        passenger.booking_service_request.some(
          (request) =>
            ['requested', 'accepted'].includes(request.status) &&
            (!request.booking_segment_id || request.booking_segment_id === coupon.booking_segment_id),
        ))
    ) {
      throw new BookingError('SEAT_NOT_ALLOWED', 'Passenger is not eligible for an exit-row seat')
    }
    const map = await this.maps.seatMap(flightId, { bookingPassengerId, cabin: seat.cabin })
    const displayed = map.rows.flatMap((row) => row.seats).find((item) => item.code === seatCode)
    if (!displayed || displayed.status !== 'free') throw new BookingError('SEAT_UNAVAILABLE', 'The seat is no longer available')
    const now = this.clock.now()
    const expiresAt = new Date(now.getTime() + ttlMs)
    try {
      const assignment = await this.db.$transaction(async (tx) => {
        const bookings = await tx.$queryRaw<
          Array<{ status: string }>
        >`SELECT status FROM booking WHERE id = ${coupon.booking_id}::uuid FOR UPDATE`
        if (bookings[0]?.status !== 'confirmed') throw new BookingError('BOOKING_CLOSED', 'Booking is no longer confirmed')
        if (options.rejectCheckedIn) {
          const checkIn = await tx.check_in.findFirst({
            where: { booking_passenger_id: bookingPassengerId, flight_id: flightId, status: { in: ['checked_in', 'boarded', 'no_show'] } },
            select: { id: true },
          })
          if (checkIn) throw new BookingError('BOOKING_CLOSED', 'Seat changes after check-in are handled by check-in')
        }
        const active = await tx.booking_coupon.findFirst({
          where: { id: coupon.id, status: 'confirmed' },
          include: {
            booking_segment: true,
            booking_passenger: { include: { other_booking_passenger: true, booking_service_request: true } },
          },
        })
        if (!active) throw new BookingError('BOOKING_CLOSED', 'Flight coupon is no longer confirmed')
        const person = active.booking_passenger
        if (
          seat.cabin !== active.booking_segment.cabin ||
          person.passenger_type === 'infant' ||
          (seat.type === 'exit' &&
            (person.passenger_type !== 'adult' ||
              person.other_booking_passenger ||
              person.booking_service_request.some(
                (request) =>
                  ['requested', 'accepted'].includes(request.status) &&
                  (!request.booking_segment_id || request.booking_segment_id === active.booking_segment_id),
              )))
        ) {
          throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is not allowed for this passenger')
        }
        return tx.seat_assignment.create({
          data: {
            booking_coupon_id: active.id,
            flight_id: flightId,
            seat_code: seatCode,
            status: 'held',
            hold_expires_at: expiresAt,
            fee_amount: displayed.fee,
            updated_at: now,
          },
        })
      })
      return { id: assignment.id, flightId, seatCode, expiresAt: expiresAt.toISOString(), fee: displayed.fee }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new BookingError('SEAT_UNAVAILABLE', 'The seat is no longer available')
      throw error
    }
  }

  async release(lockId: string): Promise<void> {
    const now = this.clock.now()
    await this.db.seat_assignment.updateMany({
      where: { id: lockId, status: 'held' },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  }

  async confirm(
    lockId: string,
    options: {
      rejectCheckedIn?: boolean
      payWithCheckout?: boolean
      staffOverride?: { userId: string; staffId: string; reason: string }
    } = {},
  ): Promise<{ seatCode: string; type: SeatType }> {
    const now = this.clock.now()
    return this.db.$transaction(async (tx) => {
      const reference = await tx.seat_assignment.findUnique({
        where: { id: lockId },
        select: { booking_coupon: { select: { booking_id: true } } },
      })
      if (!reference) throw new NotFoundException('Seat hold not found')
      // Match the booking-confirmation and cancellation lock order before touching the seat row.
      const bookings = await tx.$queryRaw<
        Array<{ status: string; currency: string }>
      >`SELECT status, currency FROM booking WHERE id = ${reference.booking_coupon.booking_id}::uuid FOR UPDATE`
      const booking = bookings[0]
      if (!booking || booking.status !== 'confirmed') throw new BookingError('BOOKING_CLOSED', 'Booking is no longer confirmed')
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM seat_assignment WHERE id = ${lockId}::uuid FOR UPDATE`
      if (!rows.length) throw new NotFoundException('Seat hold not found')
      const held = await tx.seat_assignment.findUniqueOrThrow({ where: { id: lockId } })
      const coupon = await tx.booking_coupon.findUnique({
        where: { id: held.booking_coupon_id },
        select: {
          status: true,
          booking_passenger_id: true,
          booking_segment_id: true,
          flight_id: true,
          booking_segment: { select: { cabin: true } },
          booking_passenger: { include: { other_booking_passenger: true, booking_service_request: true } },
        },
      })
      if (coupon?.status !== 'confirmed') throw new BookingError('BOOKING_CLOSED', 'Flight coupon is no longer confirmed')
      if (options.rejectCheckedIn) {
        const checkIn = await tx.check_in.findFirst({
          where: {
            booking_passenger_id: coupon.booking_passenger_id,
            flight_id: coupon.flight_id,
            status: { in: ['checked_in', 'boarded', 'no_show'] },
          },
          select: { id: true },
        })
        if (checkIn) throw new BookingError('BOOKING_CLOSED', 'Seat changes after check-in are handled by check-in')
      }
      const map = await this.layouts.getSeatMap(held.flight_id)
      const seat = map.rows.flatMap((row) => row.seats).find((item) => item.seatCode === held.seat_code)
      if (!seat || seat.blocked) throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is no longer available on this aircraft')
      const type: SeatType =
        seat.type === 'exit' ? 'exit' : seat.type === 'extra_legroom' ? 'front' : seat.cabin === 'business' ? 'business' : 'standard'
      if (held.status === 'assigned') return { seatCode: held.seat_code, type }
      if (held.status !== 'held' || !held.hold_expires_at || held.hold_expires_at <= now)
        throw new BookingError('SEAT_UNAVAILABLE', 'Seat hold has expired')
      const passenger = coupon.booking_passenger
      if (
        seat.cabin !== coupon.booking_segment.cabin ||
        passenger.passenger_type === 'infant' ||
        (seat.type === 'exit' &&
          (passenger.passenger_type !== 'adult' ||
            passenger.other_booking_passenger ||
            passenger.booking_service_request.some(
              (request) =>
                ['requested', 'accepted'].includes(request.status) &&
                (!request.booking_segment_id || request.booking_segment_id === coupon.booking_segment_id),
            )))
      ) {
        throw new BookingError('SEAT_NOT_ALLOWED', 'Seat is not allowed for this passenger')
      }
      let paymentId = held.payment_id
      if (Number(held.fee_amount) > 0) {
        if (!paymentId && options.payWithCheckout) {
          const payment = await this.checkout.charge(
            {
              bookingId: reference.booking_coupon.booking_id,
              amount: Number(held.fee_amount),
              currency: booking.currency,
              idempotencyKey: `seat:${lockId}`,
              purchaseRef: `seat_assignment:${lockId}`,
            },
            tx,
          )
          paymentId = payment.paymentId
        }
        if (!paymentId) throw new BookingError('SEAT_NOT_ALLOWED', 'Payment is required before assigning this seat')
        const payment = await tx.payment.findFirst({
          where: {
            id: paymentId,
            booking_id: reference.booking_coupon.booking_id,
            purchase_ref: `seat_assignment:${lockId}`,
            status: 'captured',
            currency: booking.currency,
            amount_total: held.fee_amount,
          },
          select: { id: true },
        })
        if (!payment) throw new BookingError('SEAT_NOT_ALLOWED', 'Seat payment has not been captured for this purchase')
      }
      const override = options.staffOverride
      let staff: { id: string; role: { code: string } } | null = null
      if (override) {
        if (!override.reason.trim() || override.reason.trim().length > 500)
          throw new BookingError('SEAT_NOT_ALLOWED', 'A staff seat assignment requires a reason of 1 to 500 characters', 422)
        staff = await tx.staff.findFirst({
          where: {
            id: override.staffId,
            user_id: override.userId,
            deleted_at: null,
            user: { type: 'staff', deleted_at: null, disabled_at: null },
          },
          select: { id: true, role: { select: { code: true } } },
        })
        if (!staff) throw new BookingError('SEAT_NOT_ALLOWED', 'An active staff account is required', 403)
      }
      await tx.seat_assignment.updateMany({
        where: { booking_coupon_id: held.booking_coupon_id, status: 'assigned' },
        data: { status: 'released', released_at: now, updated_at: now },
      })
      await tx.seat_assignment.update({
        where: { id: lockId },
        data: {
          status: 'assigned',
          assigned_at: now,
          hold_expires_at: null,
          updated_at: now,
          ...(paymentId ? { payment_id: paymentId } : {}),
          ...(staff ? { assigned_by_staff_id: staff.id } : {}),
        },
      })
      if (override && staff)
        await this.audit.write(
          {
            actor: { type: 'staff', id: override.userId, role: staff.role.code },
            sourceFeature: '3b',
            action: 'update',
            entityType: 'seat_assignment',
            entityId: lockId,
            summary: 'Staff assigned a passenger seat',
            reason: override.reason.trim(),
            after: { seatCode: held.seat_code, bookingCouponId: held.booking_coupon_id },
            occurredAt: now,
          },
          tx,
        )
      return { seatCode: held.seat_code, type }
    })
  }

  async assigned(bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType } | null> {
    const seats = await this.db.seat_assignment.findMany({
      where: { status: 'assigned', booking_coupon: { booking_passenger_id: bookingPassengerId } },
      take: 2,
    })
    if (seats.length !== 1) return null
    const seat = seats[0]
    const layout = await this.layouts.getSeatMap(seat.flight_id)
    const definition = layout.rows.flatMap((row) => row.seats).find((item) => item.seatCode === seat.seat_code)
    if (!definition) return null
    return {
      seatCode: seat.seat_code,
      type:
        definition.type === 'exit'
          ? 'exit'
          : definition.type === 'extra_legroom'
            ? 'front'
            : definition.cabin === 'business'
              ? 'business'
              : 'standard',
    }
  }

  async assignAnyStandard(flightId: string, bookingPassengerId: string): Promise<{ seatCode: string; type: SeatType }> {
    const coupon = await this.db.booking_coupon.findFirst({
      where: { flight_id: flightId, booking_passenger_id: bookingPassengerId, status: 'confirmed' },
      include: { booking_segment: true },
    })
    if (!coupon) throw new NotFoundException('Confirmed booking for this flight not found')
    const cabin = coupon.booking_segment.cabin as Cabin
    const [map, layout] = await Promise.all([this.maps.seatMap(flightId, { bookingPassengerId, cabin }), this.layouts.getSeatMap(flightId)])
    const standardSeats = new Set(
      layout.rows
        .flatMap((row) => row.seats)
        .filter((seat) => seat.cabin === cabin && seat.type === 'standard' && !seat.blocked)
        .map((seat) => seat.seatCode),
    )
    for (const seat of map.rows
      .flatMap((row) => row.seats)
      .filter((item) => item.status === 'free' && standardSeats.has(item.code) && item.fee === 0)) {
      let lock: SeatLock | undefined
      try {
        lock = await this.hold(flightId, seat.code, bookingPassengerId, 300_000)
        return await this.confirm(lock.id)
      } catch (error) {
        if (lock) await this.release(lock.id)
        if (error instanceof BookingError && error.code === 'SEAT_UNAVAILABLE') continue
        throw error
      }
    }
    throw new BookingError('SEAT_UNAVAILABLE', 'No standard seats are available')
  }

  async releaseAssigned(bookingPassengerId: string): Promise<void> {
    const seats = await this.db.seat_assignment.findMany({
      where: { status: 'assigned', booking_coupon: { booking_passenger_id: bookingPassengerId } },
      select: { id: true },
      take: 2,
    })
    if (seats.length > 1) throw new BookingError('SEAT_NOT_ALLOWED', 'A flight is required for a passenger with multiple seats')
    if (!seats.length) return
    const now = this.clock.now()
    await this.db.seat_assignment.updateMany({
      where: { id: seats[0].id, status: 'assigned' },
      data: { status: 'released', released_at: now, updated_at: now },
    })
  }
}
