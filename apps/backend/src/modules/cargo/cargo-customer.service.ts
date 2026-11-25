import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoBookingService, type QuoteInput, type BookingInput } from './cargo-booking.service'
import { CargoEventsService } from './cargo-events.service'
import { refundFailed, refundFull, getAircraftCapacity, seatsTakenOnFlight } from './cargo-deps'
import { availableKg } from './cargo-calc'
import { committedKgOnFlight } from './cargo-weight'
import { addDays, localDateStr } from './cargo-input'

@Injectable()
export class CargoCustomerService {
  constructor(
    private readonly db: DbService,
    private readonly bookings: CargoBookingService,
    private readonly events: CargoEventsService,
  ) {}

  async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    })
    if (!customer) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Customer account not found' } })
    }
    return customer.id
  }

  async listRoutes() {
    const routes = await this.db.route.findMany({
      where: { is_active: true },
      include: {
        airport_route_originToairport: { select: { iata_code: true, name: true } },
        airport_route_destinationToairport: { select: { iata_code: true, name: true } },
      },
      orderBy: { origin: 'asc' },
    })
    return routes.map((r) => ({
      id: r.id,
      origin: r.origin,
      originName: r.airport_route_originToairport.name,
      destination: r.destination,
      destinationName: r.airport_route_destinationToairport.name,
      distanceKm: r.distance_km,
    }))
  }

  async listCommodityTypes() {
    const types = await this.db.cargo_commodity_type.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    })
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      handlingClass: t.handling_class,
      minWeightKg: Number(t.min_weight_kg),
      maxWeightKg: Number(t.max_weight_kg),
      maxPieceWeightKg: Number(t.max_piece_weight_kg),
    }))
  }

  async getQuote(input: QuoteInput) {
    const result = await this.bookings.quote(input)

    const route = await this.db.route.findUnique({
      where: { id: result.routeId },
      include: {
        airport_route_originToairport: { select: { iata_code: true, name: true } },
        airport_route_destinationToairport: { select: { iata_code: true, name: true } },
      },
    })

    const flight = await this.db.flight.findUnique({
      where: { id: result.flightId },
      select: { id: true, aircraft_id: true },
    })

    const settings = await this.loadSettings()
    let aircraftName = ''
    let flightAvailableKg = 0
    if (flight) {
      const capacity = await getAircraftCapacity(this.db, flight.aircraft_id)
      const seats = await seatsTakenOnFlight(this.db, flight.id)
      const committed = await committedKgOnFlight(this.db, flight.id)
      flightAvailableKg = Math.round(
        availableKg({
          holdLimitKg: capacity.holdLimitKg,
          sellableSeats: capacity.sellableSeats,
          seatsTaken: seats,
          reserveKgPerPax: settings.reserveKgPerPax,
          floorPercent: settings.floorPercent,
          committedKg: committed,
        }),
      )
      const ac = await this.db.aircraft.findUnique({
        where: { id: flight.aircraft_id },
        include: { aircraft_type: { select: { manufacturer: true, model: true } } },
      })
      aircraftName = ac?.aircraft_type ? `${ac.aircraft_type.manufacturer} ${ac.aircraft_type.model}` : ''
    }

    const rate = await this.db.cargo_rate.findFirst({
      where: { id: result.rateId },
      select: { min_distance_km: true, max_distance_km: true },
    })
    const bandLabel = rate ? `${rate.min_distance_km}–${rate.max_distance_km ?? '∞'} km` : ''

    const commodity = await this.db.cargo_commodity_type.findUnique({
      where: { id: result.commodityTypeId },
      select: { name: true },
    })

    const volumetricKg = input.declaredVolumeM3 * settings.volumetricKgPerM3

    return {
      flightNumber: result.flightNumber,
      flightId: result.flightId,
      depAt: result.depAt,
      arrAt: result.arrAt,
      origin: route?.airport_route_originToairport.iata_code ?? '',
      originName: route?.airport_route_originToairport.name ?? '',
      destination: route?.airport_route_destinationToairport.iata_code ?? '',
      destinationName: route?.airport_route_destinationToairport.name ?? '',
      distanceKm: result.distanceKm,
      aircraft: aircraftName,
      availableKg: flightAvailableKg,
      actualWeightKg: input.declaredWeightKg,
      volumetricKg: Math.round(volumetricKg * 10) / 10,
      chargeableKg: result.chargeableKg,
      commodityName: commodity?.name ?? '',
      bandLabel,
      ratePerKg: result.ratePerKg,
      minCharge: result.minCharge,
      charge: result.charge,
      currency: result.currency,
      volumetricKgPerM3: settings.volumetricKgPerM3,
    }
  }

  async getShipDates(routeId: string, weightKg?: number) {
    const now = simNow()
    const settings = await this.loadSettings()
    const { today, lastDay } = await this.shipDateWindow(routeId, now, settings.requestWindowDays)
    const cutoffTime = new Date(now.getTime() + settings.cutoffHours * 3_600_000)
    const dates: { date: string; hasOpenFlight: boolean; maxAvailableKg: number; fits: boolean }[] = []

    for (let dateStr = today; dateStr <= lastDay; dateStr = addDays(dateStr, 1)) {
      const flights = await this.db.flight.findMany({
        where: {
          route_id: routeId,
          service_date: new Date(dateStr + 'T00:00:00Z'),
          status: { in: ['scheduled', 'delayed', 'holding'] },
          dep_at: { gt: cutoffTime },
        },
        select: { id: true, aircraft_id: true },
      })

      let maxAvail = 0
      for (const f of flights) {
        const capacity = await getAircraftCapacity(this.db, f.aircraft_id)
        const seats = await seatsTakenOnFlight(this.db, f.id)
        const committed = await committedKgOnFlight(this.db, f.id)
        const avail = availableKg({
          holdLimitKg: capacity.holdLimitKg,
          sellableSeats: capacity.sellableSeats,
          seatsTaken: seats,
          reserveKgPerPax: settings.reserveKgPerPax,
          floorPercent: settings.floorPercent,
          committedKg: committed,
        })
        if (avail > maxAvail) maxAvail = avail
      }

      dates.push({
        date: dateStr,
        hasOpenFlight: flights.length > 0,
        maxAvailableKg: Math.round(maxAvail),
        fits: weightKg != null ? maxAvail >= weightKg : true,
      })
    }

    return { dates, holdMinutes: settings.holdMinutes }
  }

  async getRouteFlights(routeId: string, date: string) {
    const now = simNow()
    const settings = await this.loadSettings()
    const cutoffTime = new Date(now.getTime() + settings.cutoffHours * 3_600_000)

    const flights = await this.db.flight.findMany({
      where: {
        route_id: routeId,
        service_date: new Date(date + 'T00:00:00Z'),
        status: { in: ['scheduled', 'delayed', 'holding'] },
        dep_at: { gt: cutoffTime },
      },
      orderBy: { dep_at: 'asc' },
      select: {
        id: true,
        flight_number: true,
        dep_at: true,
        arr_at: true,
        aircraft_id: true,
        route: {
          include: {
            airport_route_originToairport: { select: { iata_code: true, name: true } },
            airport_route_destinationToairport: { select: { iata_code: true, name: true } },
          },
        },
      },
    })

    const result: {
      id: string
      flightNumber: string
      depAt: Date
      arrAt: Date
      origin: string
      originName: string
      destination: string
      destinationName: string
      aircraft: string
      availableKg: number
    }[] = []
    for (const f of flights) {
      const capacity = await getAircraftCapacity(this.db, f.aircraft_id)
      const seats = await seatsTakenOnFlight(this.db, f.id)
      const committed = await committedKgOnFlight(this.db, f.id)
      const avail = availableKg({
        holdLimitKg: capacity.holdLimitKg,
        sellableSeats: capacity.sellableSeats,
        seatsTaken: seats,
        reserveKgPerPax: settings.reserveKgPerPax,
        floorPercent: settings.floorPercent,
        committedKg: committed,
      })
      const ac = await this.db.aircraft.findUnique({
        where: { id: f.aircraft_id },
        include: { aircraft_type: { select: { manufacturer: true, model: true } } },
      })
      result.push({
        id: f.id,
        flightNumber: f.flight_number,
        depAt: f.dep_at,
        arrAt: f.arr_at,
        origin: f.route.airport_route_originToairport.iata_code,
        originName: f.route.airport_route_originToairport.name,
        destination: f.route.airport_route_destinationToairport.iata_code,
        destinationName: f.route.airport_route_destinationToairport.name,
        aircraft: ac?.aircraft_type ? `${ac.aircraft_type.manufacturer} ${ac.aircraft_type.model}` : '',
        availableKg: Math.round(avail),
      })
    }

    return result
  }

  async getSettings() {
    const settings = await this.loadSettings()
    return {
      holdMinutes: settings.holdMinutes,
      requestWindowDays: settings.requestWindowDays,
      volumetricKgPerM3: settings.volumetricKgPerM3,
      claimWindowDays: settings.claimWindowDays,
    }
  }

  async createBooking(customerId: string, input: BookingInput) {
    const now = simNow()
    const settings = await this.loadSettings()
    const { today, lastDay: maxDateStr } = await this.shipDateWindow(input.routeId, now, settings.requestWindowDays)

    if (input.shipDate < today) {
      throw new BadRequestException({
        error: { code: 'INVALID_DATE', message: 'Ship date cannot be in the past' },
      })
    }
    if (input.shipDate > maxDateStr) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_DATE',
          message: `Ship date must be within ${settings.requestWindowDays} days from today`,
        },
      })
    }

    const booking = await this.bookings.createHeldBooking(customerId, input)
    return {
      id: booking.id,
      bookingRef: booking.booking_ref,
      flightId: booking.flight_id,
      amountDue: Number(booking.quoted_charge),
      currency: booking.currency,
      holdExpiresAt: booking.hold_expires_at,
    }
  }

  async listMyBookings(customerId: string, opts: { status?: string; page: number; pageSize: number }) {
    const { status, page, pageSize } = opts
    const offset = (page - 1) * pageSize

    const rows = await this.db.$queryRaw<
      {
        id: string
        booking_ref: string
        awb_number: string | null
        origin: string
        destination: string
        flight_number: string
        ship_date: Date
        commodity_type_name: string
        pieces: number
        goods_description: string
        declared_weight_kg: string
        quoted_charge: string
        currency: string
        current_status: string | null
        booked_at: Date
        hold_expires_at: Date
        refund_amount: string | null
      }[]
    >`
      WITH statused AS (
        SELECT cb.*,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
        WHERE cb.customer_id = ${customerId}::uuid
      )
      SELECT
        s.id, s.booking_ref, s.awb_number,
        r.origin, r.destination,
        f.flight_number,
        s.ship_date,
        cct.name AS commodity_type_name,
        s.pieces,
        s.goods_description,
        s.declared_weight_kg::text AS declared_weight_kg,
        s.quoted_charge::text AS quoted_charge,
        s.currency, s.current_status, s.booked_at, s.hold_expires_at,
        (SELECT rf.amount::text FROM refund rf WHERE rf.payment_id = s.payment_id LIMIT 1) AS refund_amount
      FROM statused s
      JOIN cargo_commodity_type cct ON cct.id = s.commodity_type_id
      JOIN flight f ON f.id = s.flight_id
      JOIN route r ON r.id = s.route_id
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
      ORDER BY s.booked_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const totalRows = await this.db.$queryRaw<{ total: bigint }[]>`
      WITH statused AS (
        SELECT cb.id,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
        WHERE cb.customer_id = ${customerId}::uuid
      )
      SELECT COUNT(*)::bigint AS total
      FROM statused s
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
    `

    const total = Number(totalRows[0]?.total ?? 0)

    return {
      data: rows.map((r) => ({
        id: r.id,
        bookingRef: r.booking_ref,
        awbNumber: r.awb_number,
        origin: r.origin,
        destination: r.destination,
        flightNumber: r.flight_number,
        shipDate: r.ship_date,
        commodityTypeName: r.commodity_type_name,
        pieces: r.pieces,
        goodsDescription: r.goods_description,
        declaredWeightKg: Number(r.declared_weight_kg),
        charge: Number(r.quoted_charge),
        currency: r.currency,
        status: r.current_status ?? 'unknown',
        bookedAt: r.booked_at,
        holdExpiresAt: r.hold_expires_at,
        refundAmount: r.refund_amount ? Number(r.refund_amount) : null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async getMyBooking(customerId: string, bookingId: string) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id: bookingId },
      include: {
        cargo_commodity_type: { select: { name: true, handling_class: true } },
        cargo_rate: { select: { min_distance_km: true, max_distance_km: true } },
        route: {
          include: {
            airport_route_originToairport: { select: { name: true } },
            airport_route_destinationToairport: { select: { name: true } },
          },
        },
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
          },
        },
      },
    })
    if (!booking || booking.customer_id !== customerId) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }

    const events = await this.db.cargo_shipment_event.findMany({
      where: { cargo_booking_id: bookingId },
      orderBy: { seq: 'asc' },
    })

    const currentStatus = events.length > 0 ? events[events.length - 1].status_after : null

    const claim = await this.db.cargo_claim.findUnique({
      where: { cargo_booking_id: bookingId },
      include: {
        cargo_claim_decision: { select: { decision: true, approved_amount: true, note: true, decided_at: true } },
      },
    })

    return {
      id: booking.id,
      bookingRef: booking.booking_ref,
      awbNumber: booking.awb_number,
      status: currentStatus ?? 'unknown',
      holdExpiresAt: booking.hold_expires_at,
      goods: {
        pieces: booking.pieces,
        declaredWeightKg: Number(booking.declared_weight_kg),
        declaredVolumeM3: Number(booking.declared_volume_m3),
        goodsDescription: booking.goods_description,
        commodityTypeName: booking.cargo_commodity_type.name,
        handlingClass: booking.handling_class,
        unNumber: booking.un_number,
      },
      quote: {
        distanceKm: booking.distance_km,
        // The band of the rate this booking was priced on: min ≤ distance < max, no upper limit when max is null.
        distanceBand: { minKm: booking.cargo_rate.min_distance_km, maxKm: booking.cargo_rate.max_distance_km },
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
        originName: booking.route.airport_route_originToairport.name,
        destination: booking.route.destination,
        destinationName: booking.route.airport_route_destinationToairport.name,
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
        measuredWeightKg: e.measured_weight_kg != null ? Number(e.measured_weight_kg) : null,
        measuredVolumeM3: e.measured_volume_m3 != null ? Number(e.measured_volume_m3) : null,
      })),
      claim: claim
        ? {
            id: claim.id,
            claimRef: claim.claim_ref,
            claimType: claim.claim_type,
            piecesAffected: claim.pieces_affected,
            description: claim.description,
            claimedAmount: Number(claim.claimed_amount),
            currency: claim.currency,
            filedAt: claim.filed_at,
            decision: claim.cargo_claim_decision
              ? {
                  decision: claim.cargo_claim_decision.decision,
                  approvedAmount: claim.cargo_claim_decision.approved_amount ? Number(claim.cargo_claim_decision.approved_amount) : null,
                  note: claim.cargo_claim_decision.note,
                  decidedAt: claim.cargo_claim_decision.decided_at,
                }
              : null,
          }
        : null,
    }
  }

  async cancelMyBooking(customerId: string, bookingId: string) {
    return this.db.$transaction(async (tx) => {
      // Lock the row before reading the status, so a payment confirming at the same moment either lands first (and this
      // cancel refunds it) or waits until this cancel commits. Reading outside the lock could cancel a paid booking unrefunded.
      const status = await this.events.lockedStatus(tx, bookingId)
      const booking = await tx.cargo_booking.findUnique({
        where: { id: bookingId },
        select: { customer_id: true, booking_ref: true, payment_id: true, quoted_charge: true },
      })
      if (!booking || booking.customer_id !== customerId) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
      }

      if (status === 'held') {
        const event = await this.events.appendEvent(tx, { bookingId, eventType: 'cancelled', actorType: 'customer' })
        return { status: event.status_after }
      }

      if (status === 'booked' && booking.payment_id) {
        let refundResult: { refundId: string | undefined }
        try {
          refundResult = await refundFull(tx, booking.booking_ref, booking.payment_id, Number(booking.quoted_charge), 'cancel')
        } catch (e) {
          throw refundFailed('cancellation', e)
        }
        const event = await this.events.appendEvent(tx, {
          bookingId,
          eventType: 'cancelled',
          actorType: 'customer',
          refundId: refundResult.refundId,
        })
        return { status: event.status_after, refundId: refundResult.refundId }
      }

      throw new ConflictException({
        error: { code: 'INVALID_TRANSITION', message: `Cannot cancel a booking in '${status}' status` },
      })
    })
  }

  async listMyNotices(customerId: string, opts: { unread?: boolean; page: number; pageSize: number }) {
    const { unread, page, pageSize } = opts
    const offset = (page - 1) * pageSize

    const where = {
      cargo_booking: { customer_id: customerId },
      ...(unread === true ? { read_at: null } : unread === false ? { read_at: { not: null } } : {}),
    }

    const [notices, total, unreadCount] = await Promise.all([
      this.db.cargo_notice.findMany({
        where,
        include: { cargo_booking: { select: { id: true, booking_ref: true } } },
        orderBy: { notified_at: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      this.db.cargo_notice.count({ where }),
      this.db.cargo_notice.count({
        where: { cargo_booking: { customer_id: customerId }, read_at: null },
      }),
    ])

    return {
      data: notices.map((n) => ({
        id: n.id,
        bookingId: n.cargo_booking.id,
        bookingRef: n.cargo_booking.booking_ref,
        title: n.title,
        message: n.message,
        notifiedAt: n.notified_at,
        readAt: n.read_at,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      unreadCount,
    }
  }

  async markNoticeRead(customerId: string, noticeId: string) {
    const notice = await this.db.cargo_notice.findUnique({
      where: { id: noticeId },
      include: { cargo_booking: { select: { customer_id: true } } },
    })
    if (!notice || notice.cargo_booking.customer_id !== customerId) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Notice not found' } })
    }
    if (notice.read_at) {
      return { id: notice.id, readAt: notice.read_at }
    }
    const now = simNow()
    const updated = await this.db.cargo_notice.update({
      where: { id: noticeId },
      data: { read_at: now },
    })
    return { id: updated.id, readAt: updated.read_at }
  }

  async listClaimable(customerId: string) {
    const settings = await this.loadSettings()
    const now = simNow()
    const windowMs = settings.claimWindowDays * 24 * 3600_000

    const rows = await this.db.$queryRaw<
      {
        id: string
        booking_ref: string
        awb_number: string | null
        goods_description: string
        declared_weight_kg: string
        flight_number: string
        origin: string
        destination: string
        delivered_at: Date
      }[]
    >`
      SELECT
        cb.id, cb.booking_ref, cb.awb_number,
        cb.goods_description, cb.declared_weight_kg::text,
        f.flight_number, r.origin, r.destination,
        del.occurred_at AS delivered_at
      FROM cargo_booking cb
      JOIN flight f ON f.id = cb.flight_id
      JOIN route r ON r.id = cb.route_id
      JOIN cargo_shipment_event del
        ON del.cargo_booking_id = cb.id AND del.event_type = 'delivered'
      LEFT JOIN cargo_claim cc ON cc.cargo_booking_id = cb.id
      WHERE cb.customer_id = ${customerId}::uuid
        AND cc.id IS NULL
        AND (SELECT cse.status_after FROM cargo_shipment_event cse
             WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) = 'delivered'
        AND del.occurred_at > ${new Date(now.getTime() - windowMs)}::timestamptz
      ORDER BY del.occurred_at DESC
    `

    return {
      claimWindowDays: settings.claimWindowDays,
      data: rows.map((r) => {
        const deliveredAt = new Date(r.delivered_at)
        const deadline = new Date(deliveredAt.getTime() + windowMs)
        const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000))
        return {
          id: r.id,
          bookingRef: r.booking_ref,
          awbNumber: r.awb_number,
          goodsDescription: r.goods_description,
          declaredWeightKg: Number(r.declared_weight_kg),
          flightNumber: r.flight_number,
          origin: r.origin,
          destination: r.destination,
          deliveredAt: r.delivered_at,
          claimDeadline: deadline,
          daysLeft,
        }
      }),
    }
  }

  async markAllNoticesRead(customerId: string) {
    const now = simNow()
    const result = await this.db.cargo_notice.updateMany({
      where: {
        cargo_booking: { customer_id: customerId },
        read_at: null,
      },
      data: { read_at: now },
    })
    return { marked: result.count }
  }

  /** The Air Waybill view of one of the customer's own bookings, looked up by its number. */
  async getMyWaybill(customerId: string, awb: string) {
    const digits = awb.replace(/\D/g, '')
    const booking = await this.db.cargo_booking.findFirst({
      where: { customer_id: customerId, OR: [{ awb_number: awb }, { awb_number: digits }] },
      select: { id: true },
    })
    if (!booking) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Air Waybill not found' } })
    return this.getMyBooking(customerId, booking.id)
  }

  async trackBooking(customerId: string, opts: { ref?: string; awb?: string }) {
    if (!opts.ref && !opts.awb) {
      throw new BadRequestException({ error: { code: 'NOT_FOUND', message: 'Provide ref or awb query parameter' } })
    }

    // References are stored upper-case (CG-XXXXXX) and AWBs as 11 digits; accept what people type: cg-xxxxxx, 999-0000001-1.
    const awbDigits = opts.awb?.replace(/\D/g, '')
    const booking = await this.db.cargo_booking.findFirst({
      where: {
        customer_id: customerId,
        ...(opts.ref ? { booking_ref: opts.ref.trim().toUpperCase() } : { OR: [{ awb_number: opts.awb }, { awb_number: awbDigits }] }),
      },
      select: { id: true, booking_ref: true, awb_number: true },
    })
    if (!booking) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }

    const events = await this.db.cargo_shipment_event.findMany({
      where: { cargo_booking_id: booking.id },
      orderBy: { seq: 'asc' },
    })

    const currentStatus = events.length > 0 ? events[events.length - 1].status_after : 'unknown'

    return {
      bookingId: booking.id,
      bookingRef: booking.booking_ref,
      awbNumber: booking.awb_number,
      status: currentStatus,
      timeline: events.map((e) => ({
        occurredAt: e.occurred_at,
        eventType: e.event_type,
        statusAfter: e.status_after,
        airportCode: e.airport_code,
        note: e.note,
      })),
    }
  }

  /** Bookable ship dates: today to today + request_window_days, both in the route origin's local calendar (as service_date is). */
  private async shipDateWindow(routeId: string, now: Date, windowDays: number): Promise<{ today: string; lastDay: string }> {
    const route = await this.db.route.findUnique({
      where: { id: routeId },
      select: { airport_route_originToairport: { select: { timezone: true } } },
    })
    if (!route) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
    const today = localDateStr(now, route.airport_route_originToairport.timezone)
    return { today, lastDay: addDays(today, windowDays) }
  }

  private async loadSettings() {
    const rows = await this.db.cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      requestWindowDays: Number(map.get('request_window_days') ?? 14),
      holdMinutes: Number(map.get('hold_minutes') ?? 15),
      cutoffHours: Number(map.get('booking_cutoff_hours') ?? 4),
      reserveKgPerPax: Number(map.get('baggage_reserve_kg_per_passenger') ?? 15),
      floorPercent: Number(map.get('baggage_reserve_floor_percent') ?? 50),
      volumetricKgPerM3: Number(map.get('volumetric_kg_per_m3') ?? 167),
      claimWindowDays: Number(map.get('claim_window_days') ?? 14),
    }
  }
}
