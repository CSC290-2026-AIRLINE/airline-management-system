import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoEventsService } from './cargo-events.service'
import { chargeableKg, freightCharge, availableKg, awbNumber } from './cargo-calc'
import { getAircraftCapacity, seatsTakenOnFlight, awbPrefix } from './cargo-deps'

const CARGO_CURRENCY = 'USD'
const COMMITTED_STATUSES = new Set(['held', 'booked', 'accepted', 'loaded', 'in_transit'])

export interface QuoteInput {
  routeId: string
  shipDate: string
  commodityTypeId: string
  goodsDescription: string
  unNumber?: string
  pieces: number
  declaredWeightKg: number
  declaredVolumeM3: number
}

export interface BookingInput extends QuoteInput {
  shipperName: string
  shipperPhone?: string
  consigneeName: string
  consigneeAddress: string
  consigneePhone?: string
}

interface QuoteResult {
  flightId: string
  flightNumber: string
  depAt: Date
  arrAt: Date
  routeId: string
  distanceKm: number
  commodityTypeId: string
  handlingClass: string
  chargeableKg: number
  rateId: string
  ratePerKg: number
  minCharge: number
  charge: number
  currency: string
}

@Injectable()
export class CargoBookingService {
  constructor(
    private readonly db: DbService,
    private readonly events: CargoEventsService,
  ) {}

  async quote(input: QuoteInput): Promise<QuoteResult> {
    return this.runQuote(this.db, input)
  }

  async createHeldBooking(customerId: string, input: BookingInput) {
    return this.db.$transaction(async (tx) => {
      const q = await this.runQuote(tx, input)

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cargo-flight:${q.flightId}`}, 0))`

      const recheck = await this.committedKg(tx, q.flightId)
      const settings = await this.loadSettings(tx)
      const aircraftId = await this.flightAircraftId(tx, q.flightId)
      const capacity = await getAircraftCapacity(tx, aircraftId)
      const seats = seatsTakenOnFlight(tx, q.flightId)
      const available = availableKg({
        holdLimitKg: capacity.holdLimitKg,
        sellableSeats: capacity.sellableSeats,
        seatsTaken: seats,
        reserveKgPerPax: settings.reserveKgPerPax,
        floorPercent: settings.floorPercent,
        committedKg: recheck,
      })
      if (available < input.declaredWeightKg) {
        throw new ConflictException({
          error: { code: 'CAPACITY_EXCEEDED', message: 'Not enough cargo capacity on this flight', details: { available_kg: available } },
        })
      }

      const now = simNow()
      const ref = generateBookingRef()

      const booking = await tx.cargo_booking.create({
        data: {
          booking_ref: ref,
          customer_id: customerId,
          route_id: q.routeId,
          flight_id: q.flightId,
          ship_date: new Date(input.shipDate + 'T00:00:00Z'),
          commodity_type_id: q.commodityTypeId,
          handling_class: q.handlingClass,
          goods_description: input.goodsDescription,
          un_number: input.unNumber ?? null,
          pieces: input.pieces,
          declared_weight_kg: input.declaredWeightKg,
          declared_volume_m3: input.declaredVolumeM3,
          shipper_name: input.shipperName,
          shipper_phone: input.shipperPhone ?? null,
          consignee_name: input.consigneeName,
          consignee_address: input.consigneeAddress,
          consignee_phone: input.consigneePhone ?? null,
          distance_km: q.distanceKm,
          quoted_chargeable_kg: q.chargeableKg,
          quoted_rate_id: q.rateId,
          rate_per_kg: q.ratePerKg,
          min_charge: q.minCharge,
          quoted_charge: q.charge,
          currency: q.currency,
          booked_at: now,
          hold_expires_at: new Date(now.getTime() + settings.holdMinutes * 60_000),
        },
      })

      await this.events.appendEvent(tx, {
        bookingId: booking.id,
        eventType: 'held',
        actorType: 'customer',
      })

      return booking
    })
  }

  async confirmCargoBooking(ref: string, paymentId: string, amount: number) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; quoted_charge: string; hold_expires_at: Date; payment_id: string | null; awb_number: string | null }[]
      >`
        SELECT id, quoted_charge::text, hold_expires_at, payment_id, awb_number
        FROM cargo_booking
        WHERE booking_ref = ${ref}
        FOR UPDATE
      `
      if (rows.length === 0) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Booking ${ref} not found` } })
      }
      const booking = rows[0]

      if (booking.payment_id === paymentId) {
        return { bookingId: booking.id, awbNumber: booking.awb_number, idempotent: true }
      }

      if (booking.payment_id !== null) {
        throw new ConflictException({ error: { code: 'ALREADY_CONFIRMED', message: 'Booking is already confirmed' } })
      }

      const now = simNow()

      if (now > booking.hold_expires_at) {
        throw new ConflictException({ error: { code: 'HOLD_EXPIRED', message: 'The booking hold has expired' } })
      }

      const quoted = Number(booking.quoted_charge)
      if (Math.abs(amount - quoted) > 0.005) {
        throw new BadRequestException({
          error: { code: 'PAYMENT_MISMATCH', message: `Payment amount ${amount} does not match quoted charge ${quoted}` },
        })
      }

      const prefix = awbPrefix(tx)
      const serial = await this.nextAwbSerial(tx)
      const awb = awbNumber(prefix, serial)

      await tx.cargo_booking.update({
        where: { id: booking.id },
        data: {
          payment_id: paymentId,
          awb_number: awb,
          awb_issued_at: now,
          updated_at: now,
        },
      })

      await this.events.appendEvent(tx, {
        bookingId: booking.id,
        eventType: 'confirmed',
        actorType: 'system',
      })

      return { bookingId: booking.id, awbNumber: awb, idempotent: false }
    })
  }

  // ── Private ────────────────────────────────────────────────────────

  private async runQuote(tx: Prisma.TransactionClient | DbService, input: QuoteInput): Promise<QuoteResult> {
    const now = simNow()
    const settings = await this.loadSettings(tx)

    // 1. Prohibited items
    const prohibited = await tx.cargo_prohibited_item.findMany({ where: { is_active: true }, select: { keyword: true } })
    const descLower = input.goodsDescription.toLowerCase()
    const hit = prohibited.find((p) => descLower.includes(p.keyword.toLowerCase()))
    if (hit) {
      throw new BadRequestException({
        error: { code: 'PROHIBITED_ITEM', message: `Goods description contains prohibited keyword: ${hit.keyword}` },
      })
    }

    // 2. Commodity type weight limits
    const commodityType = await tx.cargo_commodity_type.findFirst({
      where: { id: input.commodityTypeId, is_active: true },
    })
    if (!commodityType) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Commodity type not found or inactive' } })
    }

    if (input.declaredWeightKg < Number(commodityType.min_weight_kg) || input.declaredWeightKg > Number(commodityType.max_weight_kg)) {
      throw new BadRequestException({
        error: {
          code: 'WEIGHT_OUT_OF_RANGE',
          message: `Weight must be between ${String(commodityType.min_weight_kg)} and ${String(commodityType.max_weight_kg)} kg`,
        },
      })
    }

    if (input.pieces > 0 && input.declaredWeightKg / input.pieces > Number(commodityType.max_piece_weight_kg)) {
      throw new BadRequestException({
        error: { code: 'PIECE_TOO_HEAVY', message: `Average piece weight exceeds ${String(commodityType.max_piece_weight_kg)} kg` },
      })
    }

    // 3. Dangerous goods UN number
    if (commodityType.handling_class === 'dangerous') {
      if (!input.unNumber || !/^UN\d{4}$/.test(input.unNumber)) {
        throw new BadRequestException({
          error: { code: 'UN_NUMBER_REQUIRED', message: 'Dangerous goods require a UN number in the format UNxxxx' },
        })
      }
    }

    // 4. Find eligible flight
    const cutoffTime = new Date(now.getTime() + settings.cutoffHours * 3_600_000)
    const flights = await tx.flight.findMany({
      where: {
        route_id: input.routeId,
        service_date: new Date(input.shipDate + 'T00:00:00Z'),
        status: { in: ['scheduled', 'delayed', 'holding'] },
        dep_at: { gt: cutoffTime },
      },
      orderBy: { dep_at: 'asc' },
      select: { id: true, flight_number: true, dep_at: true, arr_at: true, aircraft_id: true },
    })

    let selectedFlight: (typeof flights)[number] | null = null

    for (const flight of flights) {
      const capacity = await getAircraftCapacity(tx, flight.aircraft_id)
      const seats = seatsTakenOnFlight(tx, flight.id)
      const committed = await this.committedKg(tx, flight.id)
      const available = availableKg({
        holdLimitKg: capacity.holdLimitKg,
        sellableSeats: capacity.sellableSeats,
        seatsTaken: seats,
        reserveKgPerPax: settings.reserveKgPerPax,
        floorPercent: settings.floorPercent,
        committedKg: committed,
      })
      if (available >= input.declaredWeightKg) {
        selectedFlight = flight
        break
      }
    }

    if (!selectedFlight) {
      throw new BadRequestException({
        error: { code: 'NO_FLIGHT_AVAILABLE', message: 'No flight with enough capacity found for the requested date and route' },
      })
    }

    // 5. Find rate band
    const route = await tx.route.findUnique({ where: { id: input.routeId }, select: { distance_km: true } })
    if (!route) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
    }

    const rate = await tx.cargo_rate.findFirst({
      where: {
        commodity_type_id: input.commodityTypeId,
        is_active: true,
        min_distance_km: { lte: route.distance_km },
        OR: [{ max_distance_km: null }, { max_distance_km: { gt: route.distance_km } }],
      },
    })
    if (!rate) {
      throw new BadRequestException({
        error: { code: 'NO_RATE', message: 'No active rate band covers the distance for this commodity type' },
      })
    }

    // 6. Calculate charge
    const chargeable = chargeableKg(input.declaredWeightKg, input.declaredVolumeM3, settings.volumetricKgPerM3)
    const charge = freightCharge(chargeable, Number(rate.rate_per_kg), Number(rate.min_charge))

    return {
      flightId: selectedFlight.id,
      flightNumber: selectedFlight.flight_number,
      depAt: selectedFlight.dep_at,
      arrAt: selectedFlight.arr_at,
      routeId: input.routeId,
      distanceKm: route.distance_km,
      commodityTypeId: input.commodityTypeId,
      handlingClass: commodityType.handling_class,
      chargeableKg: chargeable,
      rateId: rate.id,
      ratePerKg: Number(rate.rate_per_kg),
      minCharge: Number(rate.min_charge),
      charge,
      currency: CARGO_CURRENCY,
    }
  }

  private async loadSettings(tx: Prisma.TransactionClient | DbService) {
    const rows = await tx.cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      cutoffHours: Number(map.get('booking_cutoff_hours') ?? 4),
      holdMinutes: Number(map.get('hold_minutes') ?? 15),
      volumetricKgPerM3: Number(map.get('volumetric_kg_per_m3') ?? 167),
      reserveKgPerPax: Number(map.get('baggage_reserve_kg_per_passenger') ?? 15),
      floorPercent: Number(map.get('baggage_reserve_floor_percent') ?? 50),
      tolerancePercent: Number(map.get('weight_tolerance_percent') ?? 10),
    }
  }

  private async committedKg(tx: Prisma.TransactionClient | DbService, flightId: string): Promise<number> {
    const bookings = await tx.cargo_booking.findMany({
      where: { flight_id: flightId },
      select: {
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' }, take: 1, select: { status_after: true } },
      },
    })
    return bookings
      .filter((b) => {
        const status = b.cargo_shipment_event[0]?.status_after
        return status != null && COMMITTED_STATUSES.has(status)
      })
      .reduce((sum, b) => sum + Number(b.declared_weight_kg), 0)
  }

  private async flightAircraftId(tx: Prisma.TransactionClient | DbService, flightId: string): Promise<string> {
    const flight = await tx.flight.findUnique({ where: { id: flightId }, select: { aircraft_id: true } })
    if (!flight) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })
    return flight.aircraft_id
  }

  private async nextAwbSerial(tx: Prisma.TransactionClient | DbService): Promise<number> {
    const result = await (tx as DbService).$queryRaw<{ next_serial: number }[]>`
      SELECT COALESCE(MAX(CAST(SPLIT_PART(awb_number, '-', 2) AS INTEGER)), 0) + 1 AS next_serial
      FROM cargo_booking
      WHERE awb_number IS NOT NULL
    `
    return Number(result[0].next_serial)
  }
}

function generateBookingRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return `CG-${code}`
}
