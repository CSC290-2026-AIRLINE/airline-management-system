import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { availableKg, chargeableKg, exceedsTolerance } from './cargo-calc'
import { getAircraftCapacity, loadedBaggageKg, refundFull, seatsTakenOnFlight } from './cargo-deps'
import { CargoEventsService } from './cargo-events.service'
import {
  BOOKING_WEIGHT_SELECT,
  COMMITTED_STATUSES,
  LOADED_STATUSES,
  bookingWeightKg,
  committedKgOnFlight,
  latestStatus,
  sumWeightKg,
} from './cargo-weight'

/** 99900000103 -> 999-0000010-3, the way the Air Waybill is printed everywhere else. */
function formatAwb(raw: string | null): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}` : raw
}

/** The payment to refund. A booking the transition table lets staff cancel or reject is always paid; refuse cleanly if not. */
function requirePayment(paymentId: string | null, status: string | null): string {
  if (!paymentId) {
    throw new ConflictException({
      error: { code: 'INVALID_TRANSITION', message: `Booking in '${status}' status has no payment to refund` },
    })
  }
  return paymentId
}

const CLOSED_STATUSES = ['expired', 'cancelled', 'rejected']

interface BookingRow {
  id: string
  booking_ref: string
  awb_number: string | null
  shipper_name: string
  consignee_name: string
  flight_number: string
  flight_service_date: Date
  flight_dep_at: Date
  flight_origin: string
  flight_destination: string
  commodity_type_name: string
  pieces: number
  quoted_chargeable_kg: string
  quoted_charge: string
  currency: string
  current_status: string | null
  booked_at: Date
  has_refund: boolean
}

interface StatusCount {
  status: string | null
  count: bigint
}

@Injectable()
export class CargoDeskService {
  constructor(
    private readonly db: DbService,
    private readonly events: CargoEventsService,
  ) {}

  async listBookings(opts: {
    status?: string
    q?: string
    page: number
    pageSize: number
    flightId?: string
    shipDate?: string
    commodityTypeId?: string
  }) {
    const { status, q, page, pageSize, flightId, shipDate, commodityTypeId } = opts
    const offset = (page - 1) * pageSize
    const search = q ? `%${q}%` : null

    const rows = await this.db.$queryRaw<BookingRow[]>`
      WITH statused AS (
        SELECT cb.*,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status,
          EXISTS (SELECT 1 FROM cargo_shipment_event cse
                  WHERE cse.cargo_booking_id = cb.id AND cse.refund_id IS NOT NULL) AS has_refund
        FROM cargo_booking cb
      )
      SELECT
        s.id, s.booking_ref, s.awb_number, s.shipper_name, s.consignee_name,
        f.flight_number, f.service_date AS flight_service_date,
        f.dep_at AS flight_dep_at,
        r.origin AS flight_origin, r.destination AS flight_destination,
        cct.name AS commodity_type_name,
        s.pieces,
        s.quoted_chargeable_kg::text AS quoted_chargeable_kg,
        s.quoted_charge::text AS quoted_charge,
        s.currency, s.current_status, s.booked_at, s.has_refund
      FROM statused s
      JOIN cargo_commodity_type cct ON cct.id = s.commodity_type_id
      JOIN flight f ON f.id = s.flight_id
      JOIN route r ON r.id = s.route_id
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text
             OR f.flight_number ILIKE ${search}::text)
        AND (${flightId ?? null}::uuid IS NULL OR s.flight_id = ${flightId ?? null}::uuid)
        AND (${shipDate ?? null}::date IS NULL OR f.service_date = ${shipDate ?? null}::date)
        AND (${commodityTypeId ?? null}::uuid IS NULL OR s.commodity_type_id = ${commodityTypeId ?? null}::uuid)
      ORDER BY s.booked_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const totalRows = await this.db.$queryRaw<{ total: bigint }[]>`
      WITH statused AS (
        SELECT cb.id, cb.booking_ref, cb.awb_number, cb.shipper_name, cb.consignee_name,
          cb.flight_id, cb.commodity_type_id,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
      )
      SELECT COUNT(*)::bigint AS total
      FROM statused s
      JOIN flight f ON f.id = s.flight_id
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text
             OR f.flight_number ILIKE ${search}::text)
        AND (${flightId ?? null}::uuid IS NULL OR s.flight_id = ${flightId ?? null}::uuid)
        AND (${shipDate ?? null}::date IS NULL OR f.service_date = ${shipDate ?? null}::date)
        AND (${commodityTypeId ?? null}::uuid IS NULL OR s.commodity_type_id = ${commodityTypeId ?? null}::uuid)
    `

    const total = Number(totalRows[0]?.total ?? 0)
    const counts = await this.statusCounts()

    const [flightFilters, commodityFilters, settingsRows] = await Promise.all([
      this.db.$queryRaw<{ id: string; flight_number: string }[]>`
        SELECT DISTINCT f.id, f.flight_number
        FROM cargo_booking cb JOIN flight f ON f.id = cb.flight_id
        ORDER BY f.flight_number
      `,
      this.db.$queryRaw<{ id: string; name: string }[]>`
        SELECT DISTINCT cct.id, cct.name
        FROM cargo_booking cb JOIN cargo_commodity_type cct ON cct.id = cb.commodity_type_id
        ORDER BY cct.name
      `,
      this.db.cargo_setting.findMany({ where: { key: { in: ['hold_minutes', 'claim_window_days'] } } }),
    ])

    const settingsMap = new Map(settingsRows.map((r) => [r.key, r.value]))

    return {
      data: rows.map((r) => ({
        id: r.id,
        bookingRef: r.booking_ref,
        awbNumber: r.awb_number,
        shipperName: r.shipper_name,
        consigneeName: r.consignee_name,
        flightNumber: r.flight_number,
        flightServiceDate: r.flight_service_date,
        flightDepAt: r.flight_dep_at,
        flightOrigin: r.flight_origin,
        flightDestination: r.flight_destination,
        commodityTypeName: r.commodity_type_name,
        pieces: r.pieces,
        quotedChargeableKg: Number(r.quoted_chargeable_kg),
        quotedCharge: Number(r.quoted_charge),
        currency: r.currency,
        status: r.current_status ?? 'unknown',
        bookedAt: r.booked_at,
        hasRefund: r.has_refund,
      })),
      counts,
      filters: {
        flights: flightFilters.map((f) => ({ id: f.id, flightNumber: f.flight_number })),
        commodityTypes: commodityFilters,
      },
      settings: {
        holdMinutes: Number(settingsMap.get('hold_minutes') ?? 15),
        claimWindowDays: Number(settingsMap.get('claim_window_days') ?? 14),
      },
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async getBookingDetail(id: string) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id },
      include: {
        cargo_commodity_type: { select: { name: true, handling_class: true } },
        route: { select: { origin: true, destination: true, distance_km: true } },
        flight: {
          select: {
            id: true,
            flight_number: true,
            service_date: true,
            scheduled_dep_at: true,
            scheduled_arr_at: true,
            dep_at: true,
            arr_at: true,
            status: true,
            aircraft_id: true,
          },
        },
      },
    })
    if (!booking) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }

    const events = await this.db.cargo_shipment_event.findMany({
      where: { cargo_booking_id: id },
      orderBy: { seq: 'asc' },
    })

    const notices = await this.db.cargo_notice.findMany({
      where: { cargo_booking_id: id },
      orderBy: { notified_at: 'asc' },
    })

    const claim = await this.db.cargo_claim.findUnique({
      where: { cargo_booking_id: id },
      select: { id: true, claim_ref: true },
    })

    const currentStatus = events.length > 0 ? events[events.length - 1].status_after : null

    const acceptedEvent = events.find((e) => e.event_type === 'accepted')
    const measured = acceptedEvent
      ? {
          weightKg: acceptedEvent.measured_weight_kg ? Number(acceptedEvent.measured_weight_kg) : null,
          volumeM3: acceptedEvent.measured_volume_m3 ? Number(acceptedEvent.measured_volume_m3) : null,
          chargeableKg: acceptedEvent.measured_chargeable_kg ? Number(acceptedEvent.measured_chargeable_kg) : null,
        }
      : null

    const capacity = await getAircraftCapacity(this.db, booking.flight.aircraft_id)
    const seats = await seatsTakenOnFlight(this.db, booking.flight.id)
    const committedKg = await committedKgOnFlight(this.db, booking.flight.id)
    const settings = await this.loadSettings()
    const freeKg = availableKg({
      holdLimitKg: capacity.holdLimitKg,
      sellableSeats: capacity.sellableSeats,
      seatsTaken: seats,
      reserveKgPerPax: settings.reserveKgPerPax,
      floorPercent: settings.floorPercent,
      committedKg,
    })

    return {
      header: {
        id: booking.id,
        bookingRef: booking.booking_ref,
        awbNumber: booking.awb_number,
        currentStatus: currentStatus ?? 'unknown',
        quotedCharge: Number(booking.quoted_charge),
        currency: booking.currency,
        paymentId: booking.payment_id,
      },
      goods: {
        pieces: booking.pieces,
        declaredWeightKg: Number(booking.declared_weight_kg),
        declaredVolumeM3: Number(booking.declared_volume_m3),
        goodsDescription: booking.goods_description,
        commodityTypeName: booking.cargo_commodity_type.name,
        handlingClass: booking.handling_class,
        unNumber: booking.un_number,
        measured,
      },
      quote: {
        distanceKm: booking.distance_km,
        chargeableKg: Number(booking.quoted_chargeable_kg),
        ratePerKg: Number(booking.rate_per_kg),
        minCharge: Number(booking.min_charge),
        charge: Number(booking.quoted_charge),
        currency: booking.currency,
      },
      flight: {
        id: booking.flight.id,
        flightNumber: booking.flight.flight_number,
        serviceDate: booking.flight.service_date,
        scheduledDepAt: booking.flight.scheduled_dep_at,
        scheduledArrAt: booking.flight.scheduled_arr_at,
        depAt: booking.flight.dep_at,
        arrAt: booking.flight.arr_at,
        status: booking.flight.status,
        origin: booking.route.origin,
        destination: booking.route.destination,
        freeKg,
      },
      shipper: {
        name: booking.shipper_name,
        phone: booking.shipper_phone,
      },
      consignee: {
        name: booking.consignee_name,
        address: booking.consignee_address,
        phone: booking.consignee_phone,
      },
      timeline: events.map((e) => ({
        id: e.id,
        occurredAt: e.occurred_at,
        eventType: e.event_type,
        statusBefore: e.status_before,
        statusAfter: e.status_after,
        actorType: e.actor_type,
        flightId: e.flight_id,
        airportCode: e.airport_code,
        note: e.note,
        measuredWeightKg: e.measured_weight_kg ? Number(e.measured_weight_kg) : null,
        measuredVolumeM3: e.measured_volume_m3 ? Number(e.measured_volume_m3) : null,
        measuredChargeableKg: e.measured_chargeable_kg ? Number(e.measured_chargeable_kg) : null,
        refundId: e.refund_id,
      })),
      notices: notices.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        notifiedAt: n.notified_at,
        readAt: n.read_at,
      })),
      claim: claim ? { id: claim.id, claimRef: claim.claim_ref } : null,
    }
  }

  async getWaybill(awb: string) {
    const digits = awb.replace(/\D/g, '')
    const booking = await this.db.cargo_booking.findFirst({
      where: { OR: [{ awb_number: awb }, { awb_number: digits }] },
      select: { id: true },
    })
    if (!booking) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Air Waybill not found' } })
    return this.getBookingDetail(booking.id)
  }

  async acceptBooking(id: string, measuredWeightKg: number, measuredVolumeM3: number, userId: string) {
    return this.db.$transaction(async (tx) => {
      const staffId = await this.resolveStaffId(tx, userId)
      const settings = await this.loadSettingsFull(tx)
      const measuredChargeable = chargeableKg(measuredWeightKg, measuredVolumeM3, settings.volumetricKgPerM3)

      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'accepted',
        actorType: 'staff',
        staffId,
        measuredWeightKg,
        measuredVolumeM3,
        measuredChargeableKg: measuredChargeable,
      })

      return { status: event.status_after, measuredChargeableKg: measuredChargeable }
    })
  }

  async rejectBooking(id: string, measuredWeightKg: number, measuredVolumeM3: number, reason: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const staffId = await this.resolveStaffId(tx, userId)
      const settings = await this.loadSettingsFull(tx)
      const measuredChargeable = chargeableKg(measuredWeightKg, measuredVolumeM3, settings.volumetricKgPerM3)

      const status = await this.events.lockedStatus(tx, id)
      const booking = await tx.cargo_booking.findUnique({
        where: { id },
        select: { booking_ref: true, payment_id: true, quoted_chargeable_kg: true, quoted_charge: true },
      })
      if (!booking) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
      }
      // Check the move before the refund: a refund on a booking that cannot be rejected (or was never paid) must not start.
      await this.events.assertTransition(tx, status, 'rejected', 'staff')
      const paymentId = requirePayment(booking.payment_id, status)

      const quotedChargeable = Number(booking.quoted_chargeable_kg)
      if (!exceedsTolerance(measuredChargeable, quotedChargeable, settings.tolerancePercent)) {
        throw new ConflictException({
          error: {
            code: 'TOLERANCE_NOT_EXCEEDED',
            message: 'Measured chargeable weight is within the tolerance — accept the shipment instead',
            details: { measuredChargeableKg: measuredChargeable, quotedChargeableKg: quotedChargeable },
          },
        })
      }

      let refundResult: { refundId: string }
      try {
        refundResult = await refundFull(tx, booking.booking_ref, paymentId, Number(booking.quoted_charge), 'rejected')
      } catch (e) {
        throw new InternalServerErrorException({
          error: {
            code: 'REFUND_FAILED',
            message: `Refund could not be processed — rejection was not recorded: ${e instanceof Error ? e.message : String(e)}`,
          },
        })
      }

      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'rejected',
        actorType: 'staff',
        staffId,
        measuredWeightKg,
        measuredVolumeM3,
        measuredChargeableKg: measuredChargeable,
        refundId: refundResult.refundId,
        note: reason,
      })

      return { status: event.status_after, refundId: refundResult.refundId }
    })
  }

  async postEvent(id: string, eventType: string, note: string | undefined, userId: string) {
    const ALLOWED = new Set(['loaded', 'delivered', 'cancelled'])
    if (!ALLOWED.has(eventType)) {
      throw new BadRequestException({
        error: { code: 'INVALID_TRANSITION', message: `Event type '${eventType}' is not allowed` },
      })
    }

    return this.db.$transaction(async (tx) => {
      const staffId = await this.resolveStaffId(tx, userId)
      // Lock the row first: whether a cancel refunds, and with which reason, depends on a status nobody else may change meanwhile.
      const status = await this.events.lockedStatus(tx, id)
      const booking = await tx.cargo_booking.findUnique({
        where: { id },
        select: {
          id: true,
          booking_ref: true,
          flight_id: true,
          payment_id: true,
          quoted_charge: true,
          declared_weight_kg: true,
          cargo_shipment_event: {
            orderBy: { seq: 'desc' as const },
            select: { status_after: true, event_type: true, measured_weight_kg: true },
          },
        },
      })
      if (!booking) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
      }

      if (eventType === 'cancelled') {
        if (!note) {
          throw new BadRequestException({
            error: { code: 'INVALID_TRANSITION', message: 'A note is required when cancelling' },
          })
        }
        await this.events.assertTransition(tx, status, 'cancelled', 'staff')
        const paymentId = requirePayment(booking.payment_id, status)
        // A booking left needing a new flight because its flight was cancelled or diverted is refunded as a flight refund (5b's
        // `:flight` key); any other staff cancel, an offloaded booking included, is an ordinary cancel.
        const cause = booking.cargo_shipment_event[0]?.event_type
        const refundReason = status === 'rebook_required' && (cause === 'flight_cancelled' || cause === 'diverted') ? 'flight' : 'cancel'
        let refundResult: { refundId: string }
        try {
          refundResult = await refundFull(tx, booking.booking_ref, paymentId, Number(booking.quoted_charge), refundReason)
        } catch (e) {
          throw new InternalServerErrorException({
            error: {
              code: 'REFUND_FAILED',
              message: `Refund could not be processed — cancellation was not recorded: ${e instanceof Error ? e.message : String(e)}`,
            },
          })
        }
        const event = await this.events.appendEvent(tx, {
          bookingId: id,
          eventType: 'cancelled',
          actorType: 'staff',
          staffId,
          refundId: refundResult.refundId,
          note,
        })
        return { status: event.status_after, refundId: refundResult.refundId }
      }

      if (eventType === 'loaded') {
        const measuredWeight = bookingWeightKg(booking)
        const flight = await tx.flight.findUnique({ where: { id: booking.flight_id }, select: { aircraft_id: true } })
        if (!flight) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })
        const capacity = await getAircraftCapacity(tx, flight.aircraft_id)

        const baggage = loadedBaggageKg(booking.flight_id)
        if (baggage !== null) {
          const loadedCargoOnFlight = await this.loadedCargoKg(tx, booking.flight_id)
          if (baggage + loadedCargoOnFlight + measuredWeight > capacity.holdLimitKg) {
            throw new ConflictException({
              error: {
                code: 'CAPACITY_EXCEEDED',
                message: 'Not enough cargo capacity on this flight',
                details: { available_kg: capacity.holdLimitKg - baggage - loadedCargoOnFlight },
              },
            })
          }
        } else {
          const settings = await this.loadSettingsFull(tx)
          const seats = await seatsTakenOnFlight(tx, booking.flight_id)
          const committed = await committedKgOnFlight(tx, booking.flight_id, id)
          const available = availableKg({
            holdLimitKg: capacity.holdLimitKg,
            sellableSeats: capacity.sellableSeats,
            seatsTaken: seats,
            reserveKgPerPax: settings.reserveKgPerPax,
            floorPercent: settings.floorPercent,
            committedKg: committed,
          })
          if (measuredWeight > available) {
            throw new ConflictException({
              error: {
                code: 'CAPACITY_EXCEEDED',
                message: 'Not enough cargo capacity on this flight',
                details: { available_kg: available },
              },
            })
          }
        }
      }

      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType,
        actorType: 'staff',
        staffId,
        note: note || undefined,
      })
      return { status: event.status_after }
    })
  }

  async listFlightsWithCargo(from: string, to: string, routeId?: string) {
    const where: Record<string, unknown> = {
      service_date: { gte: new Date(from + 'T00:00:00Z'), lte: new Date(to + 'T00:00:00Z') },
    }
    if (routeId) where.route_id = routeId

    const flights = await this.db.flight.findMany({
      where,
      orderBy: [{ service_date: 'asc' }, { dep_at: 'asc' }],
      select: {
        id: true,
        flight_number: true,
        service_date: true,
        route_id: true,
        dep_at: true,
        arr_at: true,
        status: true,
        aircraft_id: true,
        aircraft: { select: { tail_number: true } },
        route: { select: { origin: true, destination: true } },
        cargo_booking: { select: BOOKING_WEIGHT_SELECT },
      },
    })

    const settings = await this.loadSettings()

    const routeSet = new Map<string, { id: string; origin: string; destination: string }>()

    const results: {
      id: string
      flightNumber: string
      serviceDate: Date
      depAt: Date
      arrAt: Date
      origin: string
      destination: string
      routeId: string
      aircraft: string
      status: string
      bookingCount: number
      committedKg: number
      availableKg: number
    }[] = []

    for (const f of flights) {
      routeSet.set(f.route_id, { id: f.route_id, origin: f.route.origin, destination: f.route.destination })

      const committed = sumWeightKg(f.cargo_booking)
      const bookingCount = f.cargo_booking.filter((b) => COMMITTED_STATUSES.has(latestStatus(b) ?? '')).length

      const capacity = await getAircraftCapacity(this.db, f.aircraft_id)
      const seats = await seatsTakenOnFlight(this.db, f.id)
      const free = availableKg({
        holdLimitKg: capacity.holdLimitKg,
        sellableSeats: capacity.sellableSeats,
        seatsTaken: seats,
        reserveKgPerPax: settings.reserveKgPerPax,
        floorPercent: settings.floorPercent,
        committedKg: committed,
      })

      results.push({
        id: f.id,
        flightNumber: f.flight_number,
        serviceDate: f.service_date,
        depAt: f.dep_at,
        arrAt: f.arr_at,
        origin: f.route.origin,
        destination: f.route.destination,
        routeId: f.route_id,
        aircraft: f.aircraft.tail_number,
        status: f.status,
        bookingCount,
        committedKg: committed,
        availableKg: free,
      })
    }

    return { flights: results, routes: Array.from(routeSet.values()) }
  }

  async getFlightSummary(flightId: string) {
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      select: {
        id: true,
        flight_number: true,
        service_date: true,
        dep_at: true,
        arr_at: true,
        status: true,
        aircraft_id: true,
        route_id: true,
        aircraft: { select: { tail_number: true } },
        route: { select: { origin: true, destination: true, block_time_min: true } },
        cargo_booking: { select: BOOKING_WEIGHT_SELECT },
      },
    })
    if (!flight) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })
    }

    const settings = await this.loadSettings()
    const cutoffHours = await this.loadCutoffHours()
    const capacity = await getAircraftCapacity(this.db, flight.aircraft_id)
    const seatsTaken = await seatsTakenOnFlight(this.db, flight.id)
    const floorPax = Math.ceil((capacity.sellableSeats * settings.floorPercent) / 100)
    const reservedPassengers = Math.max(seatsTaken, floorPax)
    const baggageReserveKg = reservedPassengers * settings.reserveKgPerPax

    const committedKg = sumWeightKg(flight.cargo_booking)
    const loadedKg = sumWeightKg(flight.cargo_booking, LOADED_STATUSES)

    const free = capacity.holdLimitKg - baggageReserveKg - committedKg
    const bookingCutoffAt = new Date(flight.dep_at.getTime() - cutoffHours * 3_600_000)

    return {
      id: flight.id,
      flightNumber: flight.flight_number,
      serviceDate: flight.service_date,
      depAt: flight.dep_at,
      arrAt: flight.arr_at,
      status: flight.status,
      aircraft: flight.aircraft.tail_number,
      origin: flight.route.origin,
      destination: flight.route.destination,
      blockTimeMin: flight.route.block_time_min,
      sellableSeats: capacity.sellableSeats,
      seatsTaken,
      holdLimitKg: capacity.holdLimitKg,
      reservedPassengers,
      reserveKgPerPax: settings.reserveKgPerPax,
      floorPercent: settings.floorPercent,
      baggageReserveKg,
      committedKg,
      loadedKg,
      availableKg: free,
      bookingCutoffAt,
    }
  }

  private async loadCutoffHours(): Promise<number> {
    const rows = await this.db.cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return Number(map.get('booking_cutoff_hours') ?? 4)
  }

  async getFlightManifest(flightId: string) {
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      select: { id: true, flight_number: true, service_date: true, aircraft_id: true },
    })
    if (!flight) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })
    }

    const bookings = await this.db.cargo_booking.findMany({
      where: { flight_id: flightId },
      include: {
        cargo_commodity_type: { select: { name: true } },
        cargo_shipment_event: { orderBy: { seq: 'desc' }, select: { status_after: true, measured_weight_kg: true } },
      },
      orderBy: { booked_at: 'asc' },
    })

    const AWB_STATUSES = new Set(['booked', 'accepted', 'loaded', 'in_transit', 'arrived', 'delivered'])
    const rows = bookings
      .map((b) => {
        const latestEvent = b.cargo_shipment_event[0]
        const measuredEvent = b.cargo_shipment_event.find((e) => e.measured_weight_kg != null)
        const status = latestEvent?.status_after ?? 'unknown'
        return {
          id: b.id,
          awbNumber: b.awb_number,
          shipperName: b.shipper_name,
          consigneeName: b.consignee_name,
          commodityTypeName: b.cargo_commodity_type.name,
          handlingClass: b.handling_class,
          pieces: b.pieces,
          declaredWeightKg: Number(b.declared_weight_kg),
          measuredWeightKg: measuredEvent?.measured_weight_kg ? Number(measuredEvent.measured_weight_kg) : null,
          status,
        }
      })
      .filter((r) => AWB_STATUSES.has(r.status) && r.awbNumber != null)

    const totalPieces = rows.reduce((s, r) => s + r.pieces, 0)
    const totalDeclaredKg = rows.reduce((s, r) => s + r.declaredWeightKg, 0)
    const totalMeasuredKg = rows.reduce((s, r) => s + (r.measuredWeightKg ?? 0), 0)
    const measuredCount = rows.filter((r) => r.measuredWeightKg != null).length
    const loadedCount = rows.filter((r) => r.status === 'loaded' || r.status === 'in_transit').length

    const capacity = await getAircraftCapacity(this.db, flight.aircraft_id)
    const seats = await seatsTakenOnFlight(this.db, flight.id)
    const settings = await this.loadSettings()

    const committed = sumWeightKg(bookings)

    const free = availableKg({
      holdLimitKg: capacity.holdLimitKg,
      sellableSeats: capacity.sellableSeats,
      seatsTaken: seats,
      reserveKgPerPax: settings.reserveKgPerPax,
      floorPercent: settings.floorPercent,
      committedKg: committed,
    })

    return {
      flightNumber: flight.flight_number,
      serviceDate: flight.service_date,
      holdLimitKg: capacity.holdLimitKg,
      committedKg: committed,
      availableKg: free,
      totalDeclaredKg,
      totalMeasuredKg,
      totalPieces,
      measuredCount,
      loadedCount,
      awbCount: rows.length,
      rows,
    }
  }

  bookingsToCsv(rows: Awaited<ReturnType<CargoDeskService['listBookings']>>['data']): string {
    const header = [
      'Booking',
      'AWB',
      'Shipper',
      'Consignee',
      'Flight',
      'Ship date',
      'Commodity',
      'Pieces',
      'Chargeable kg',
      'Charge',
      'Currency',
      'Status',
      'Booked at',
    ]
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [
          r.bookingRef,
          formatAwb(r.awbNumber),
          esc(r.shipperName),
          esc(r.consigneeName),
          r.flightNumber,
          r.flightServiceDate instanceof Date ? r.flightServiceDate.toISOString().slice(0, 10) : String(r.flightServiceDate),
          esc(r.commodityTypeName),
          String(r.pieces),
          r.quotedChargeableKg.toFixed(1),
          r.quotedCharge.toFixed(2),
          r.currency,
          r.status,
          r.bookedAt instanceof Date ? r.bookedAt.toISOString() : String(r.bookedAt),
        ].join(','),
      )
    }
    return lines.join('\n')
  }

  manifestToCsv(manifest: Awaited<ReturnType<CargoDeskService['getFlightManifest']>>): string {
    const header = ['AWB', 'Shipper', 'Consignee', 'Commodity', 'Class', 'Pieces', 'Declared kg', 'Measured kg', 'Status']
    const esc = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [header.join(',')]
    for (const r of manifest.rows) {
      lines.push(
        [
          formatAwb(r.awbNumber),
          esc(r.shipperName),
          esc(r.consigneeName),
          esc(r.commodityTypeName),
          r.handlingClass,
          String(r.pieces),
          r.declaredWeightKg.toFixed(1),
          r.measuredWeightKg != null ? r.measuredWeightKg.toFixed(1) : '',
          r.status,
        ].join(','),
      )
    }
    lines.push('')
    lines.push(`Flight,${manifest.flightNumber}`)
    lines.push(`Service date,${String(manifest.serviceDate)}`)
    lines.push(`Hold limit kg,${manifest.holdLimitKg.toFixed(1)}`)
    lines.push(`Committed kg,${manifest.committedKg.toFixed(1)}`)
    lines.push(`Available kg,${manifest.availableKg.toFixed(1)}`)
    lines.push(`Total declared kg,${manifest.totalDeclaredKg.toFixed(1)}`)
    lines.push(`Total measured kg,${manifest.totalMeasuredKg.toFixed(1)}`)
    lines.push(`Total pieces,${manifest.totalPieces}`)
    lines.push(`Measured,${manifest.measuredCount} of ${manifest.awbCount}`)
    lines.push(`Loaded,${manifest.loadedCount} of ${manifest.awbCount}`)
    return lines.join('\r\n') + '\r\n'
  }

  private async loadedCargoKg(tx: Parameters<Parameters<DbService['$transaction']>[0]>[0], flightId: string): Promise<number> {
    const bookings = await (tx as DbService).cargo_booking.findMany({ where: { flight_id: flightId }, select: BOOKING_WEIGHT_SELECT })
    return sumWeightKg(bookings, LOADED_STATUSES)
  }

  private async loadSettings() {
    return this.loadSettingsFull(this.db)
  }

  private async loadSettingsFull(db: DbService | Parameters<Parameters<DbService['$transaction']>[0]>[0]) {
    const rows = await (db as DbService).cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      reserveKgPerPax: Number(map.get('baggage_reserve_kg_per_passenger') ?? 15),
      floorPercent: Number(map.get('baggage_reserve_floor_percent') ?? 50),
      volumetricKgPerM3: Number(map.get('volumetric_kg_per_m3') ?? 167),
      tolerancePercent: Number(map.get('weight_tolerance_percent') ?? 10),
    }
  }

  private async resolveStaffId(tx: Parameters<Parameters<DbService['$transaction']>[0]>[0], userId: string): Promise<string> {
    const staff = await (tx as DbService).staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    })
    if (!staff) {
      throw new ForbiddenException({ error: { code: 'STAFF_NOT_FOUND', message: 'No active staff account for the signed-in user' } })
    }
    return staff.id
  }

  private async statusCounts(): Promise<Record<string, number>> {
    const rows = await this.db.$queryRaw<StatusCount[]>`
      SELECT sub.status, COUNT(*)::bigint AS count
      FROM (
        SELECT (SELECT cse.status_after FROM cargo_shipment_event cse
                WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS status
        FROM cargo_booking cb
      ) sub
      GROUP BY sub.status
    `

    const map: Record<string, number> = {
      all: 0,
      held: 0,
      booked: 0,
      accepted: 0,
      loaded: 0,
      in_transit: 0,
      arrived: 0,
      delivered: 0,
      rebook_required: 0,
      closed: 0,
    }

    for (const row of rows) {
      const s = row.status ?? 'unknown'
      const n = Number(row.count)
      map.all += n
      if (CLOSED_STATUSES.includes(s)) {
        map.closed += n
      } else if (s in map) {
        map[s] = n
      }
    }

    return map
  }
}
