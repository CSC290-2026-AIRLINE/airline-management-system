import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoBookingService, type QuoteInput, type BookingInput } from './cargo-booking.service'
import { CargoEventsService } from './cargo-events.service'
import { refundFull } from './cargo-deps'

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
    return {
      flightNumber: result.flightNumber,
      depAt: result.depAt,
      arrAt: result.arrAt,
      distanceKm: result.distanceKm,
      chargeableKg: result.chargeableKg,
      ratePerKg: result.ratePerKg,
      minCharge: result.minCharge,
      charge: result.charge,
      currency: result.currency,
    }
  }

  async createBooking(customerId: string, input: BookingInput) {
    const now = simNow()
    const settings = await this.loadSettings()
    const today = now.toISOString().slice(0, 10)
    const maxDate = new Date(now.getTime() + settings.requestWindowDays * 86_400_000)
    const maxDateStr = maxDate.toISOString().slice(0, 10)

    if (input.shipDate < today) {
      throw new BadRequestException({
        error: { code: 'CLAIM_NOT_ALLOWED', message: 'Ship date cannot be in the past' },
      })
    }
    if (input.shipDate > maxDateStr) {
      throw new BadRequestException({
        error: {
          code: 'CLAIM_NOT_ALLOWED',
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
        quoted_charge: string
        currency: string
        current_status: string | null
        booked_at: Date
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
        s.quoted_charge::text AS quoted_charge,
        s.currency, s.current_status, s.booked_at
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
        charge: Number(r.quoted_charge),
        currency: r.currency,
        status: r.current_status ?? 'unknown',
        bookedAt: r.booked_at,
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

    const isDev = process.env.NODE_ENV !== 'production'

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
      ...(isDev ? { mock_payment_available: true } : {}),
    }
  }

  async cancelMyBooking(customerId: string, bookingId: string) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id: bookingId },
      select: { id: true, customer_id: true, booking_ref: true, payment_id: true, quoted_charge: true },
    })
    if (!booking || booking.customer_id !== customerId) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }

    const status = await this.events.currentStatus(bookingId)

    if (status === 'held') {
      return this.db.$transaction(async (tx) => {
        const event = await this.events.appendEvent(tx, {
          bookingId,
          eventType: 'cancelled',
          actorType: 'customer',
        })
        return { status: event.status_after }
      })
    }

    if (status === 'booked') {
      return this.db.$transaction(async (tx) => {
        let refundResult: { refundId: string }
        try {
          refundResult = refundFull(tx, booking.booking_ref, booking.payment_id ?? '', Number(booking.quoted_charge), 'cancel')
        } catch {
          throw new InternalServerErrorException({
            error: { code: 'REFUND_FAILED', message: 'Refund could not be processed — cancellation was not recorded' },
          })
        }
        const event = await this.events.appendEvent(tx, {
          bookingId,
          eventType: 'cancelled',
          actorType: 'customer',
          refundId: refundResult.refundId,
        })
        return { status: event.status_after, refundId: refundResult.refundId }
      })
    }

    throw new ConflictException({
      error: { code: 'INVALID_TRANSITION', message: `Cannot cancel a booking in '${status}' status` },
    })
  }

  private async loadSettings() {
    const rows = await this.db.cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      requestWindowDays: Number(map.get('request_window_days') ?? 14),
    }
  }
}
