import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { availableKg, chargeableKg, exceedsTolerance } from './cargo-calc'
import { getAircraftCapacity, loadedBaggageKg, refundFull, seatsTakenOnFlight } from './cargo-deps'
import { CargoEventsService } from './cargo-events.service'

const CLOSED_STATUSES = ['expired', 'cancelled', 'rejected']

interface BookingRow {
  id: string
  booking_ref: string
  awb_number: string | null
  shipper_name: string
  consignee_name: string
  flight_number: string
  flight_service_date: Date
  commodity_type_name: string
  pieces: number
  quoted_chargeable_kg: string
  quoted_charge: string
  currency: string
  current_status: string | null
  booked_at: Date
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

  async listBookings(opts: { status?: string; q?: string; page: number; pageSize: number }) {
    const { status, q, page, pageSize } = opts
    const offset = (page - 1) * pageSize
    const search = q ? `%${q}%` : null

    const rows = await this.db.$queryRaw<BookingRow[]>`
      WITH statused AS (
        SELECT cb.*,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
      )
      SELECT
        s.id, s.booking_ref, s.awb_number, s.shipper_name, s.consignee_name,
        f.flight_number, f.service_date AS flight_service_date,
        cct.name AS commodity_type_name,
        s.pieces,
        s.quoted_chargeable_kg::text AS quoted_chargeable_kg,
        s.quoted_charge::text AS quoted_charge,
        s.currency, s.current_status, s.booked_at
      FROM statused s
      JOIN cargo_commodity_type cct ON cct.id = s.commodity_type_id
      JOIN flight f ON f.id = s.flight_id
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text)
      ORDER BY s.booked_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const totalRows = await this.db.$queryRaw<{ total: bigint }[]>`
      WITH statused AS (
        SELECT cb.id, cb.booking_ref, cb.awb_number, cb.shipper_name, cb.consignee_name,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
      )
      SELECT COUNT(*)::bigint AS total
      FROM statused s
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text)
    `

    const total = Number(totalRows[0]?.total ?? 0)

    const counts = await this.statusCounts()

    return {
      data: rows.map((r) => ({
        id: r.id,
        bookingRef: r.booking_ref,
        awbNumber: r.awb_number,
        shipperName: r.shipper_name,
        consigneeName: r.consignee_name,
        flightNumber: r.flight_number,
        flightServiceDate: r.flight_service_date,
        commodityTypeName: r.commodity_type_name,
        pieces: r.pieces,
        quotedChargeableKg: Number(r.quoted_chargeable_kg),
        quotedCharge: Number(r.quoted_charge),
        currency: r.currency,
        status: r.current_status ?? 'unknown',
        bookedAt: r.booked_at,
      })),
      counts,
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
    const seats = seatsTakenOnFlight(this.db, booking.flight.id)
    const committedKg = await this.committedKgForFlight(booking.flight.id)
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
    }
  }

  async acceptBooking(id: string, measuredWeightKg: number, measuredVolumeM3: number) {
    return this.db.$transaction(async (tx) => {
      const settings = await this.loadSettingsFull(tx)
      const measuredChargeable = chargeableKg(measuredWeightKg, measuredVolumeM3, settings.volumetricKgPerM3)

      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'accepted',
        actorType: 'staff',
        measuredWeightKg,
        measuredVolumeM3,
        measuredChargeableKg: measuredChargeable,
      })

      return { status: event.status_after, measuredChargeableKg: measuredChargeable }
    })
  }

  async rejectBooking(id: string, measuredWeightKg: number, measuredVolumeM3: number, reason: string) {
    return this.db.$transaction(async (tx) => {
      const settings = await this.loadSettingsFull(tx)
      const measuredChargeable = chargeableKg(measuredWeightKg, measuredVolumeM3, settings.volumetricKgPerM3)

      const booking = await tx.cargo_booking.findUnique({
        where: { id },
        select: { booking_ref: true, payment_id: true, quoted_chargeable_kg: true, quoted_charge: true },
      })
      if (!booking) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
      }

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
        refundResult = refundFull(tx, booking.booking_ref, booking.payment_id ?? '', Number(booking.quoted_charge), 'rejected')
      } catch {
        throw new InternalServerErrorException({
          error: { code: 'REFUND_FAILED', message: 'Refund could not be processed — rejection was not recorded' },
        })
      }

      const event = await this.events.appendEvent(tx, {
        bookingId: id,
        eventType: 'rejected',
        actorType: 'staff',
        measuredWeightKg,
        measuredVolumeM3,
        measuredChargeableKg: measuredChargeable,
        refundId: refundResult.refundId,
        note: reason,
      })

      return { status: event.status_after, refundId: refundResult.refundId }
    })
  }

  async postEvent(id: string, eventType: string, note?: string) {
    const ALLOWED = new Set(['loaded', 'delivered', 'cancelled'])
    if (!ALLOWED.has(eventType)) {
      throw new BadRequestException({
        error: { code: 'INVALID_TRANSITION', message: `Event type '${eventType}' is not allowed` },
      })
    }

    return this.db.$transaction(async (tx) => {
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
            take: 1,
            select: { measured_weight_kg: true },
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
        let refundResult: { refundId: string }
        try {
          refundResult = refundFull(tx, booking.booking_ref, booking.payment_id ?? '', Number(booking.quoted_charge), 'cancel')
        } catch {
          throw new InternalServerErrorException({
            error: { code: 'REFUND_FAILED', message: 'Refund could not be processed — cancellation was not recorded' },
          })
        }
        const event = await this.events.appendEvent(tx, {
          bookingId: id,
          eventType: 'cancelled',
          actorType: 'staff',
          refundId: refundResult.refundId,
          note,
        })
        return { status: event.status_after, refundId: refundResult.refundId }
      }

      if (eventType === 'loaded') {
        const measuredWeight = booking.cargo_shipment_event[0]?.measured_weight_kg
          ? Number(booking.cargo_shipment_event[0].measured_weight_kg)
          : Number(booking.declared_weight_kg)

        const baggage = loadedBaggageKg(booking.flight_id)
        if (baggage !== null) {
          const capacity = await getAircraftCapacity(tx, booking.flight_id)
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
          const flight = await tx.flight.findUnique({ where: { id: booking.flight_id }, select: { aircraft_id: true } })
          if (!flight) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })

          const capacity = await getAircraftCapacity(tx, flight.aircraft_id)
          const seats = seatsTakenOnFlight(tx, booking.flight_id)
          const committed = await this.committedKgExcluding(tx, booking.flight_id, id)
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
        note: note || undefined,
      })
      return { status: event.status_after }
    })
  }

  private async loadedCargoKg(
    tx: Parameters<Parameters<DbService['$transaction']>[0]>[0],
    flightId: string,
  ): Promise<number> {
    const bookings = await (tx as DbService).cargo_booking.findMany({
      where: { flight_id: flightId },
      select: {
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' as const }, take: 1, select: { status_after: true, measured_weight_kg: true } },
      },
    })
    return bookings
      .filter((b) => {
        const s = b.cargo_shipment_event[0]?.status_after
        return s === 'loaded' || s === 'in_transit'
      })
      .reduce((sum, b) => {
        const mw = b.cargo_shipment_event[0]?.measured_weight_kg
        return sum + (mw ? Number(mw) : Number(b.declared_weight_kg))
      }, 0)
  }

  private async committedKgExcluding(
    tx: Parameters<Parameters<DbService['$transaction']>[0]>[0],
    flightId: string,
    excludeBookingId: string,
  ): Promise<number> {
    const COMMITTED = new Set(['held', 'booked', 'accepted', 'loaded', 'in_transit'])
    const bookings = await (tx as DbService).cargo_booking.findMany({
      where: { flight_id: flightId, id: { not: excludeBookingId } },
      select: {
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' as const }, take: 1, select: { status_after: true } },
      },
    })
    return bookings
      .filter((b) => {
        const s = b.cargo_shipment_event[0]?.status_after
        return s != null && COMMITTED.has(s)
      })
      .reduce((sum, b) => sum + Number(b.declared_weight_kg), 0)
  }

  private async committedKgForFlight(flightId: string): Promise<number> {
    const COMMITTED = new Set(['held', 'booked', 'accepted', 'loaded', 'in_transit'])
    const bookings = await this.db.cargo_booking.findMany({
      where: { flight_id: flightId },
      select: {
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' }, take: 1, select: { status_after: true } },
      },
    })
    return bookings
      .filter((b) => {
        const s = b.cargo_shipment_event[0]?.status_after
        return s != null && COMMITTED.has(s)
      })
      .reduce((sum, b) => sum + Number(b.declared_weight_kg), 0)
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
