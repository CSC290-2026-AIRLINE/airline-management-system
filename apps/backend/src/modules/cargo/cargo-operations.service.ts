import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'
import { CargoEventsService } from './cargo-events.service'
import { availableKg } from './cargo-calc'
import { getAircraftCapacity, seatsTakenOnFlight } from './cargo-deps'

type Tx = Prisma.TransactionClient

const OPEN_FLIGHT_STATUSES = ['scheduled', 'delayed', 'holding']
const COMMITTED_STATUSES = new Set(['held', 'booked', 'accepted', 'loaded', 'in_transit'])
/** Classes that count when checking whether two kinds of goods may share a flight. */
const CONFLICT_STATUSES = ['held', 'booked', 'accepted', 'loaded']

interface LiveBooking {
  booking_id: string
  status: string
  hold_expires_at: Date
  flight_id: string
  flight_status: string
  dep_at: Date
  arr_at: Date
  destination: string
}

/**
 * Feature 17's background work and the flight-change operations: expiring lapsed holds, reacting to Feature 2's flight
 * cancellations and diversions, moving cargo on the simulation clock (departed, offloaded, arrived), and moving a booking to
 * another flight. Every step is one event per booking in its own transaction, so a booking that already moved (a payment that
 * arrived at the same moment, a repeated flight event) is skipped instead of failing the rest.
 */
@Injectable()
export class CargoOperationsService {
  private readonly logger = new Logger('CargoOperations')

  constructor(
    private readonly db: DbService,
    private readonly events: CargoEventsService,
  ) {}

  /** One pass of every job. Safe to run again at any time. */
  async tick(): Promise<{ expired: number; moved: number }> {
    const now = simNow()
    const rows = await this.db.$queryRaw<LiveBooking[]>`
      SELECT b.id AS booking_id, s.status_after AS status, b.hold_expires_at,
             f.id AS flight_id, f.status AS flight_status, f.dep_at, f.arr_at, r.destination
      FROM cargo_booking b
      JOIN LATERAL (
        SELECT status_after FROM cargo_shipment_event WHERE cargo_booking_id = b.id ORDER BY seq DESC LIMIT 1
      ) s ON true
      JOIN flight f ON f.id = b.flight_id
      JOIN route r ON r.id = f.route_id
      WHERE s.status_after IN ('held', 'booked', 'accepted', 'loaded', 'in_transit')
    `

    let expired = 0
    let moved = 0
    for (const row of rows) {
      try {
        const result = await this.applyClockAndFlightRules(row, now)
        if (result === 'expired') expired++
        else if (result === 'moved') moved++
      } catch (e) {
        if (e instanceof ConflictException) continue // already moved by someone else
        this.logger.warn(`Booking ${row.booking_id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (expired || moved) this.logger.log(`Expired ${expired} hold(s), moved ${moved} booking(s) on flight changes`)
    return { expired, moved }
  }

  private async applyClockAndFlightRules(row: LiveBooking, now: Date): Promise<'expired' | 'moved' | 'none'> {
    // 1. A hold nobody paid for.
    if (row.status === 'held') {
      if (row.hold_expires_at <= now || row.flight_status === 'cancelled') {
        const flightEventId = row.flight_status === 'cancelled' ? await this.latestFlightEvent(row.flight_id, ['cancelled']) : undefined
        await this.append(row.booking_id, 'expired', { flightEventId: flightEventId?.id })
        return 'expired'
      }
      return 'none'
    }

    const departed = row.dep_at <= now
    const flightEvent =
      row.flight_status === 'cancelled' || row.flight_status === 'diverted'
        ? await this.latestFlightEvent(row.flight_id, [row.flight_status])
        : null

    // 2. Cancelled flight: the cargo needs a new flight.
    if (row.flight_status === 'cancelled' && ['booked', 'accepted', 'loaded'].includes(row.status)) {
      await this.append(row.booking_id, 'flight_cancelled', { flightEventId: flightEvent?.id })
      return 'moved'
    }

    // 3. Diverted before departure behaves like a cancellation. Diverted in flight keeps the cargo in transit.
    if (row.flight_status === 'diverted') {
      if (['booked', 'accepted', 'loaded'].includes(row.status) && !departed) {
        await this.append(row.booking_id, 'diverted', {
          flightEventId: flightEvent?.id,
          airportCode: flightEvent?.newDestination ?? undefined,
        })
        return 'moved'
      }
      if (row.status === 'in_transit' && flightEvent && !(await this.hasFlightEvent(row.booking_id, flightEvent.id))) {
        await this.append(row.booking_id, 'diverted', {
          flightEventId: flightEvent.id,
          airportCode: flightEvent.newDestination ?? undefined,
        })
        return 'moved'
      }
    }

    // 4. The clock: departure, missed flight, arrival.
    if (row.flight_status !== 'cancelled' && departed) {
      if (row.status === 'loaded') {
        await this.append(row.booking_id, 'departed', {})
        return 'moved'
      }
      if (row.status === 'booked' || row.status === 'accepted') {
        await this.append(row.booking_id, 'offloaded', {})
        return 'moved'
      }
    }
    if (row.status === 'in_transit' && row.arr_at <= now) {
      const diverted = await this.latestFlightEvent(row.flight_id, ['diverted'])
      await this.append(row.booking_id, 'arrived', { airportCode: diverted?.newDestination ?? row.destination })
      return 'moved'
    }
    return 'none'
  }

  private async append(bookingId: string, eventType: string, extra: { flightEventId?: string; airportCode?: string }) {
    await this.db.$transaction(async (tx) => {
      await this.events.appendEvent(tx, { bookingId, eventType, actorType: 'system', ...extra })
    })
  }

  private async latestFlightEvent(flightId: string, types: string[]) {
    const row = await this.db.flight_event.findFirst({
      where: { flight_id: flightId, type: { in: types } },
      orderBy: { seq: 'desc' },
      select: { id: true, new_destination: true },
    })
    return row ? { id: row.id, newDestination: row.new_destination } : null
  }

  private async hasFlightEvent(bookingId: string, flightEventId: string): Promise<boolean> {
    const found = await this.db.cargo_shipment_event.findFirst({
      where: { cargo_booking_id: bookingId, flight_event_id: flightEventId },
      select: { id: true },
    })
    return found != null
  }

  // ── Moving a booking to another flight ──────────────────────────

  /** Open flights of the booking's route that could take it, with the room each has. */
  async listMoveTargets(bookingId: string) {
    const booking = await this.requireRebookBooking(this.db, bookingId)
    const now = simNow()
    const settings = await this.loadSettings(this.db)
    const flights = await this.db.flight.findMany({
      where: {
        route_id: booking.route_id,
        id: { not: booking.flight_id },
        status: { in: OPEN_FLIGHT_STATUSES },
        dep_at: { gt: new Date(now.getTime() + settings.cutoffHours * 3_600_000) },
      },
      orderBy: { dep_at: 'asc' },
      select: { id: true, flight_number: true, dep_at: true, arr_at: true, aircraft_id: true },
    })
    const weight = booking.weightKg
    const result: {
      id: string
      flightNumber: string
      depAt: Date
      arrAt: Date
      availableKg: number
      fits: boolean
      conflictWith: string | null
    }[] = []
    for (const f of flights) {
      const available = await this.availableOn(this.db, f.id, f.aircraft_id, settings, bookingId)
      const conflict = await this.conflictingBookingRef(this.db, f.id, booking.handling_class, bookingId)
      result.push({
        id: f.id,
        flightNumber: f.flight_number,
        depAt: f.dep_at,
        arrAt: f.arr_at,
        availableKg: available,
        fits: available >= weight && conflict == null,
        conflictWith: conflict,
      })
    }
    return { bookingId, weightKg: weight, flights: result }
  }

  async moveToFlight(bookingId: string, flightId: string, note: string | undefined, userId: string) {
    return this.db.$transaction(async (tx) => {
      const staff = await tx.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
      if (!staff) {
        throw new ForbiddenException({ error: { code: 'STAFF_NOT_FOUND', message: 'No active staff account for the signed-in user' } })
      }

      const booking = await this.requireRebookBooking(tx, bookingId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cargo-flight:${flightId}`}, 0))`

      const flight = await tx.flight.findUnique({
        where: { id: flightId },
        select: { id: true, route_id: true, status: true, dep_at: true, aircraft_id: true },
      })
      if (!flight) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Flight not found' } })
      if (flight.route_id !== booking.route_id) {
        throw new ConflictException({ error: { code: 'INVALID_FLIGHT', message: 'The new flight must be on the same route' } })
      }

      const settings = await this.loadSettings(tx)
      const now = simNow()
      if (!OPEN_FLIGHT_STATUSES.includes(flight.status) || flight.dep_at <= new Date(now.getTime() + settings.cutoffHours * 3_600_000)) {
        throw new ConflictException({ error: { code: 'FLIGHT_CLOSED', message: 'That flight is closed for cargo' } })
      }

      const available = await this.availableOn(tx, flight.id, flight.aircraft_id, settings, bookingId)
      if (available < booking.weightKg) {
        throw new ConflictException({
          error: { code: 'CAPACITY_EXCEEDED', message: 'Not enough cargo capacity on that flight', details: { available_kg: available } },
        })
      }
      const conflict = await this.conflictingBookingRef(tx, flight.id, booking.handling_class, bookingId)
      if (conflict) {
        throw new ConflictException({
          error: {
            code: 'HANDLING_CONFLICT',
            message: `These goods cannot share a flight with ${conflict}`,
            details: { booking_ref: conflict },
          },
        })
      }

      // The booking points at its new flight; the older events keep the flight they happened on.
      await tx.$executeRaw`UPDATE cargo_booking SET flight_id = ${flight.id}::uuid, updated_at = now() WHERE id = ${bookingId}::uuid`
      const event = await this.events.appendEvent(tx, {
        bookingId,
        eventType: 'flight_changed',
        actorType: 'staff',
        staffId: staff.id,
        statusAfter: booking.wasAccepted ? 'accepted' : 'booked',
        note: note || undefined,
      })
      return { status: event.status_after, flightId: flight.id }
    })
  }

  // ── Handling conflicts (stretch) ────────────────────────────────

  /** The reference of a booking already on the flight whose goods may not share it with `handlingClass`, if there is one. */
  async conflictingBookingRef(
    db: DbService | Tx,
    flightId: string,
    handlingClass: string,
    excludeBookingId?: string,
  ): Promise<string | null> {
    const conflicts = await db.cargo_handling_conflict.findMany({
      where: { OR: [{ handling_class_a: handlingClass }, { handling_class_b: handlingClass }] },
    })
    if (conflicts.length === 0) return null
    const others = new Set(conflicts.map((c) => (c.handling_class_a === handlingClass ? c.handling_class_b : c.handling_class_a)))

    const bookings = await db.cargo_booking.findMany({
      where: { flight_id: flightId, handling_class: { in: [...others] }, ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
      select: { booking_ref: true, cargo_shipment_event: { orderBy: { seq: 'desc' }, take: 1, select: { status_after: true } } },
    })
    const hit = bookings.find((b) => CONFLICT_STATUSES.includes(b.cargo_shipment_event[0]?.status_after ?? ''))
    return hit?.booking_ref ?? null
  }

  listHandlingConflicts() {
    return this.db.cargo_handling_conflict.findMany({ orderBy: [{ handling_class_a: 'asc' }, { handling_class_b: 'asc' }] })
  }

  async addHandlingConflict(classA: string, classB: string, reason: string) {
    if (classA === classB) {
      throw new ConflictException({ error: { code: 'INVALID_PAIR', message: 'A handling class cannot conflict with itself' } })
    }
    const [a, b] = [classA, classB].sort()
    const existing = await this.db.cargo_handling_conflict.findFirst({
      where: {
        OR: [
          { handling_class_a: a, handling_class_b: b },
          { handling_class_a: b, handling_class_b: a },
        ],
      },
    })
    if (existing) {
      throw new ConflictException({ error: { code: 'DUPLICATE', message: 'That pair is already listed' } })
    }
    return this.db.cargo_handling_conflict.create({ data: { handling_class_a: a, handling_class_b: b, reason } })
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private async requireRebookBooking(db: DbService | Tx, bookingId: string) {
    const booking = await db.cargo_booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        route_id: true,
        flight_id: true,
        handling_class: true,
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' }, select: { status_after: true, event_type: true, measured_weight_kg: true } },
      },
    })
    if (!booking) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    const events = booking.cargo_shipment_event
    if (events[0]?.status_after !== 'rebook_required') {
      throw new ConflictException({
        error: { code: 'INVALID_TRANSITION', message: 'Only a booking that needs a new flight can be moved' },
      })
    }
    const measured = events.find((e) => e.measured_weight_kg != null)?.measured_weight_kg
    return {
      ...booking,
      weightKg: Number(measured ?? booking.declared_weight_kg),
      wasAccepted: events.some((e) => e.event_type === 'accepted'),
    }
  }

  private async availableOn(
    db: DbService | Tx,
    flightId: string,
    aircraftId: string,
    settings: Awaited<ReturnType<CargoOperationsService['loadSettings']>>,
    excludeBookingId: string,
  ): Promise<number> {
    const capacity = await getAircraftCapacity(db, aircraftId)
    const bookings = await db.cargo_booking.findMany({
      where: { flight_id: flightId, id: { not: excludeBookingId } },
      select: {
        declared_weight_kg: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' }, select: { status_after: true, measured_weight_kg: true } },
      },
    })
    const committedKg = bookings
      .filter((b) => COMMITTED_STATUSES.has(b.cargo_shipment_event[0]?.status_after ?? ''))
      .reduce((sum, b) => {
        const mw = b.cargo_shipment_event.find((e) => e.measured_weight_kg != null)?.measured_weight_kg
        return sum + Number(mw ?? b.declared_weight_kg)
      }, 0)
    return availableKg({
      holdLimitKg: capacity.holdLimitKg,
      sellableSeats: capacity.sellableSeats,
      seatsTaken: await seatsTakenOnFlight(db, flightId),
      reserveKgPerPax: settings.reserveKgPerPax,
      floorPercent: settings.floorPercent,
      committedKg,
    })
  }

  private async loadSettings(db: DbService | Tx) {
    const rows = await db.cargo_setting.findMany()
    const map = new Map(rows.map((r) => [r.key, r.value]))
    return {
      cutoffHours: Number(map.get('booking_cutoff_hours') ?? 4),
      reserveKgPerPax: Number(map.get('baggage_reserve_kg_per_passenger') ?? 15),
      floorPercent: Number(map.get('baggage_reserve_floor_percent') ?? 50),
    }
  }
}
