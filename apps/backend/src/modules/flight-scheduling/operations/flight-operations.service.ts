import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type {
  AircraftChangeInput,
  BatchDelayInput,
  CancelInput,
  DelayInput,
  DivertInput,
  HoldInput,
  RescheduleInput,
} from '../dto/operations.dto'
import { prismaCode, UUID } from '../pagination'
import { SettingsService } from '../settings.service'
import { AircraftFeasibilityService, assertGatesPass } from './aircraft-feasibility.service'
import { CascadeDetector, type CascadeSummary } from './cascade-detector'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'
import { FlightEventPublisher } from './flight-event-bus'
import { type FlightChange, FlightEventWriter, lockAircraft, lockFlight, type Tx } from './flight-event-writer'
import { type BuiltFlightEvent, buildFlightEvent, type FlightStatus, InvalidFlightEventError } from './flight-events'
import { SCHEDULE_APPROVALS, type ScheduleApprovals } from './schedule-approvals'

const FLIGHT_SELECT = {
  id: true,
  flight_number: true,
  service_date: true,
  status: true,
  aircraft_id: true,
  scheduled_dep_at: true,
  scheduled_arr_at: true,
  dep_at: true,
  arr_at: true,
  actual_destination: true,
  route: { select: { origin: true, destination: true, distance_km: true } },
} as const

export type LockedFlight = {
  id: string
  flight_number: string
  service_date: Date
  status: string
  aircraft_id: string
  scheduled_dep_at: Date
  scheduled_arr_at: Date
  dep_at: Date
  arr_at: Date
  actual_destination: string | null
  route: { origin: string; destination: string; distance_km: number }
}

// Statuses a flight on the ground can be delayed, cancelled or given another aircraft from. The clock decides "already
// departed" separately, because departed/arrived are written by a simulation-clock job that does not exist yet.
const ON_GROUND: FlightStatus[] = ['scheduled', 'delayed']
// A flight that is cancelled or has arrived is final.
const FINAL: FlightStatus[] = ['cancelled', 'arrived']

/** Iteration-03 blocker: partner rebooking is offered only where partner_airline_route has a row, and that table is missing. */
export const PARTNER_ROUTE_MISSING = 'Rebooking with a partner needs partner_airline_route, which is not in the database schema yet'

export interface OperationResult {
  flight: LockedFlight
  event: { id: string; type: string; seq: number; occurred_at: Date }
  conflicts: CascadeSummary
  /** Things the change could not take into account (for example seat capacity, until Feature 9 publishes it). */
  warnings: string[]
}

@Injectable()
export class FlightOperationsService {
  constructor(
    private readonly db: DbService,
    private readonly writer: FlightEventWriter,
    private readonly publisher: FlightEventPublisher,
    private readonly cascade: CascadeDetector,
    private readonly feasibility: AircraftFeasibilityService,
    private readonly settings: SettingsService,
    @Inject(SCHEDULE_APPROVALS) private readonly approvals: ScheduleApprovals,
    @Inject(FLIGHT_CLOCK) private readonly clock: FlightClock,
  ) {}

  async listEvents(flightId: string) {
    assertUuid(flightId)
    const flight = await this.db.flight.findUnique({ where: { id: flightId }, select: { id: true } })
    if (!flight) throw new NotFoundException('Flight not found')
    const events = await this.db.flight_event.findMany({ where: { flight_id: flightId }, orderBy: { seq: 'asc' } })
    // seq is BIGINT; JSON has no BigInt, and an identity column will not pass 2^53 in practice.
    return events.map((e) => ({ ...e, seq: Number(e.seq) }))
  }

  /** Delay before departure: moves departure and arrival, then walks the aircraft's later flights for cascade conflicts. */
  delay(flightId: string, input: DelayInput, actorId: string) {
    return this.run(flightId, async (tx, flight) => {
      this.assertStatus(flight, ON_GROUND, 'delay')
      this.assertNotDeparted(flight, 'delay')
      await assertReason(tx, input.reason_code)
      const event = buildFlightEvent({
        type: 'delayed',
        reasonCode: input.reason_code,
        delayMinutes: input.delay_minutes,
        oldDepAt: flight.dep_at,
        oldArrAt: flight.arr_at,
        note: input.note,
      })
      return this.commit(tx, flight, event, actorId, { dep_at: event.columns.new_dep_at!, arr_at: event.columns.new_arr_at! })
    })
  }

  /** Delays each flight in departure order. One failure never blocks the others; the caller answers 207 with every outcome. */
  async batchDelay(input: BatchDelayInput, actorId: string) {
    const rows = await this.db.flight.findMany({
      where: { id: { in: input.flight_ids } },
      orderBy: { dep_at: 'asc' },
      select: { id: true },
    })
    const known = new Set(rows.map((r) => r.id))
    const results: { flight_id: string; status: number; result?: OperationResult; error?: unknown }[] = input.flight_ids
      .filter((id) => !known.has(id))
      .map((flight_id) => ({ flight_id, status: 404, error: 'Flight not found' }))
    // Sequential on purpose: a later flight of the same aircraft sees the earlier delay (cascade check, aircraft lock).
    for (const { id } of rows) {
      try {
        results.push({ flight_id: id, status: 200, result: await this.delay(id, input, actorId) })
      } catch (e) {
        if (!(e instanceof HttpException)) throw e
        results.push({ flight_id: id, status: e.getStatus(), error: e.getResponse() })
      }
    }
    return { results }
  }

  /** Active partner airlines, for rebooking a cancelled flight. Which partner flies which route needs partner_airline_route. */
  listPartnerAirlines() {
    return this.db.partner_airline.findMany({ where: { is_active: true }, orderBy: { code: 'asc' }, select: { code: true, name: true } })
  }

  /** Diversion keeps the route and sets actual_destination; later flights then start from the wrong airport. */
  divert(flightId: string, input: DivertInput, actorId: string) {
    return this.run(flightId, async (tx, flight) => {
      this.assertStatus(flight, ['scheduled', 'delayed', 'holding', 'departed', 'diverted'], 'divert')
      if (flight.arr_at <= this.clock.now()) throw new ConflictException(`Flight ${flight.flight_number} has already arrived`)
      await assertReason(tx, input.reason_code)
      const current = flight.actual_destination ?? flight.route.destination
      if (input.airport_code === current) throw new UnprocessableEntityException(`The flight already ends at ${current}`)
      const airport = await tx.airport.findUnique({ where: { iata_code: input.airport_code }, select: { is_active: true } })
      if (!airport?.is_active) throw new UnprocessableEntityException(`Airport ${input.airport_code} is unknown or not active`)

      const event = buildFlightEvent({
        type: 'diverted',
        reasonCode: input.reason_code,
        newDestination: input.airport_code,
        note: input.note,
      })
      return this.commit(tx, flight, event, actorId, { actual_destination: input.airport_code })
    })
  }

  cancel(flightId: string, input: CancelInput, actorId: string) {
    return this.run(flightId, (tx, flight) => this.applyCancel(tx, flight, input, actorId))
  }

  changeAircraft(flightId: string, input: AircraftChangeInput, actorId: string) {
    return this.run(flightId, (tx, flight) => this.applyAircraftChange(tx, flight, input, actorId), input.aircraft_id)
  }

  /**
   * Holding: only after departure and before arrival, judged on the clock. A hold over holding_limit_minutes (flight_setting,
   * staff-editable) is not recorded; the system proposes a diversion instead (Iteration-03).
   */
  hold(flightId: string, input: HoldInput, actorId: string) {
    return this.run(flightId, async (tx, flight) => {
      this.assertInTheAir(flight)
      this.assertStatus(flight, ['scheduled', 'delayed', 'departed'], 'put into holding')
      const { holding_limit_minutes: limit } = await this.settings.get()
      if (limit === null || !Number.isInteger(limit))
        throw new InternalServerErrorException('flight_setting holding_limit_minutes is not set')
      if (input.hold_minutes > limit) {
        throw new ConflictException({
          message: `A hold of ${input.hold_minutes} min is over the holding limit of ${limit} min; divert the flight instead`,
          rule: 'holding_limit_exceeded',
          hold_minutes: input.hold_minutes,
          holding_limit_minutes: limit,
          proposal: 'divert',
        })
      }
      await assertReason(tx, input.reason_code)
      const event = buildFlightEvent({
        type: 'holding',
        reasonCode: input.reason_code,
        holdMinutes: input.hold_minutes,
        oldArrAt: flight.arr_at,
        note: input.note,
      })
      return this.commit(tx, flight, event, actorId, { arr_at: event.columns.new_arr_at! })
    })
  }

  endHold(flightId: string, note: string | undefined, actorId: string) {
    return this.run(flightId, (tx, flight) => {
      this.assertStatus(flight, ['holding'], 'end the hold of')
      return this.commit(tx, flight, buildFlightEvent({ type: 'hold_ended', note }), actorId, {})
    })
  }

  /**
   * Locks and loads the flight and runs `fn` in one transaction; the event `fn` writes is published only after the commit.
   * Exposed for conflict resolution, which closes the conflict in the same transaction.
   */
  async run<T extends { event: { id: string } }>(
    flightId: string,
    fn: (tx: Tx, flight: LockedFlight) => Promise<T>,
    otherAircraftId?: string,
  ): Promise<T> {
    assertUuid(flightId)
    const result = await this.db.$transaction(async (tx) => {
      const flight = await this.lockAndLoad(tx, flightId, otherAircraftId)
      try {
        return await fn(tx, flight)
      } catch (e) {
        throw mapWriteError(e)
      }
    })
    await this.publisher.publishCommitted([result.event.id])
    return result
  }

  async applyCancel(tx: Tx, flight: LockedFlight, input: CancelInput, actorId: string): Promise<OperationResult> {
    this.assertStatus(flight, ON_GROUND, 'cancel')
    this.assertNotDeparted(flight, 'cancel')
    await assertReason(tx, input.reason_code)
    if (input.resolution === 'rebook_partner') throw new UnprocessableEntityException(PARTNER_ROUTE_MISSING)
    // Bookings and crew after a cancellation belong to other features; Feature 2 only records and publishes (spec v2 s16).
    const event = buildFlightEvent({ type: 'cancelled', reasonCode: input.reason_code, resolution: input.resolution, note: input.note })
    return this.commit(tx, flight, event, actorId, {})
  }

  async applyAircraftChange(tx: Tx, flight: LockedFlight, input: AircraftChangeInput, actorId: string): Promise<OperationResult> {
    this.assertStatus(flight, ON_GROUND, 'change the aircraft of')
    this.assertNotDeparted(flight, 'change the aircraft of')
    if (input.aircraft_id === flight.aircraft_id) throw new BadRequestException('The flight already uses this aircraft')

    // Under both aircraft locks, on the same transaction the change is written with.
    assertGatesPass(
      await this.feasibility.checkAircraftFeasibility(input.aircraft_id, legOf(flight), tx),
      'The aircraft cannot fly this flight',
    )
    // Work split item 2 (warn when the new aircraft is smaller) needs Feature 9's seat counts, which it does not publish yet.
    const warnings = ['seat capacity: a smaller aircraft cannot be detected until Feature 9 publishes seat counts']
    const event = buildFlightEvent({
      type: 'aircraft_changed',
      oldAircraftId: flight.aircraft_id,
      newAircraftId: input.aircraft_id,
      note: input.note,
    })
    return this.commit(tx, flight, event, actorId, { aircraft_id: input.aircraft_id }, warnings, input.aircraft_id)
  }

  /**
   * Reschedule: moves the published timetable to times covered by an approved approval (purpose reschedule), after the
   * gates pass for the new times. service_date is the original departure's local date and never changes (Iteration-03).
   */
  async applyReschedule(tx: Tx, flight: LockedFlight, input: RescheduleInput, actorId: string): Promise<OperationResult> {
    this.assertStatus(flight, ON_GROUND, 'reschedule')
    this.assertNotDeparted(flight, 'reschedule')
    if (input.reason_code) await assertReason(tx, input.reason_code)

    const candidate = { ...legOf(flight), scheduledDepAt: input.dep_at, depAt: input.dep_at, arrAt: input.arr_at }
    assertGatesPass(
      await this.feasibility.checkAircraftFeasibility(flight.aircraft_id, candidate, tx),
      'The new times do not pass the gates for this aircraft',
    )
    const approval = await this.approvals.consume(tx, {
      approvalId: input.approval_id,
      purpose: 'reschedule',
      flightId: flight.id,
      flightNumber: flight.flight_number,
      serviceDate: flight.service_date,
      aircraftId: flight.aircraft_id,
      depAt: input.dep_at,
      arrAt: input.arr_at,
    })
    if (!approval.ok) throw new UnprocessableEntityException({ message: approval.detail, rule: approval.rule })
    await this.approvals.markConsumed(tx, input.approval_id, flight.id)

    const event = buildFlightEvent({
      type: 'rescheduled',
      oldDepAt: flight.dep_at,
      newDepAt: input.dep_at,
      oldArrAt: flight.arr_at,
      newArrAt: input.arr_at,
      reasonCode: input.reason_code,
      note: input.note,
    })
    const change = { scheduled_dep_at: input.dep_at, scheduled_arr_at: input.arr_at, dep_at: input.dep_at, arr_at: input.arr_at }
    return this.commit(tx, flight, event, actorId, change)
  }

  private async commit(
    tx: Tx,
    flight: LockedFlight,
    event: BuiltFlightEvent,
    actorId: string,
    change: FlightChange,
    warnings: string[] = [],
    newAircraftId?: string,
  ): Promise<OperationResult> {
    const row = await this.writer.append(tx, flight.id, event, actorId, change)
    const trigger = { flightId: flight.id, eventId: row.id, eventType: event.columns.type }

    let conflicts: CascadeSummary
    if (event.status === 'cancelled' || newAircraftId) {
      // The flight leaves this aircraft's chain: its own chain conflicts no longer apply, and the gap it leaves is re-checked.
      const superseded = await this.cascade.supersedeForFlight(tx, flight.id)
      conflicts = await this.cascade.refresh(tx, flight.aircraft_id, trigger)
      if (newAircraftId) conflicts = add(conflicts, await this.cascade.refresh(tx, newAircraftId, trigger))
      conflicts = { ...conflicts, superseded: conflicts.superseded + superseded }
    } else {
      conflicts = await this.cascade.refresh(tx, flight.aircraft_id, trigger)
    }

    const updated = (await tx.flight.findUnique({ where: { id: flight.id }, select: FLIGHT_SELECT })) as LockedFlight
    return {
      flight: updated,
      event: { id: row.id, type: row.type, seq: Number(row.seq), occurred_at: row.occurred_at },
      conflicts,
      warnings,
    }
  }

  // Aircraft locks first, in a fixed order, then the flight row: every writer takes them the same way, so none deadlock.
  private async lockAndLoad(tx: Tx, flightId: string, otherAircraftId?: string): Promise<LockedFlight> {
    const peek = await tx.flight.findUnique({ where: { id: flightId }, select: { aircraft_id: true } })
    if (!peek) throw new NotFoundException('Flight not found')
    for (const id of [...new Set([peek.aircraft_id, otherAircraftId].filter((v): v is string => !!v))].sort()) {
      await lockAircraft(tx, id)
    }
    await lockFlight(tx, flightId)
    const flight = (await tx.flight.findUnique({ where: { id: flightId }, select: FLIGHT_SELECT })) as LockedFlight
    if (flight.aircraft_id !== peek.aircraft_id) throw new ConflictException('The flight was changed by someone else; reload and try again')
    return flight
  }

  private assertStatus(flight: LockedFlight, allowed: FlightStatus[], action: string) {
    if (!allowed.includes(flight.status as FlightStatus) || FINAL.includes(flight.status as FlightStatus)) {
      throw new ConflictException(`Cannot ${action} flight ${flight.flight_number} while it is ${flight.status}`)
    }
  }

  private assertNotDeparted(flight: LockedFlight, action: string) {
    if (flight.dep_at <= this.clock.now()) {
      throw new ConflictException(
        `Cannot ${action} flight ${flight.flight_number}: it has already departed (due ${flight.dep_at.toISOString()})`,
      )
    }
  }

  private assertInTheAir(flight: LockedFlight) {
    const now = this.clock.now()
    if (!(flight.dep_at <= now && now < flight.arr_at)) {
      throw new ConflictException(`Flight ${flight.flight_number} is not in the air`)
    }
  }
}

function assertUuid(id: string) {
  if (!UUID.test(id)) throw new BadRequestException('id must be a UUID')
}

async function assertReason(tx: Tx, code: string) {
  const reason = await tx.disruption_reason.findUnique({ where: { code }, select: { is_active: true } })
  if (!reason?.is_active) throw new UnprocessableEntityException(`Unknown or inactive disruption reason ${code}`)
}

export function legOf(flight: LockedFlight) {
  return {
    flightId: flight.id,
    flightNumber: flight.flight_number,
    origin: flight.route.origin,
    destination: flight.actual_destination ?? flight.route.destination,
    scheduledDepAt: flight.scheduled_dep_at,
    depAt: flight.dep_at,
    arrAt: flight.arr_at,
    distanceKm: flight.route.distance_km,
  }
}

/** Maps errors raised inside a write transaction to the API's errors; anything else is passed through. */
export function mapWriteError(e: unknown): Error {
  if (e instanceof InvalidFlightEventError) return new BadRequestException(e.message)
  // The exclusion constraint surfaces as a raw database error, so match it by name.
  if (String((e as { message?: string } | null)?.message ?? '').includes('flight_timetable_no_aircraft_overlap')) {
    return new ConflictException('The timetable already has this aircraft on another flight at that time')
  }
  if (prismaCode(e) === 'P2003') return new UnprocessableEntityException('A referenced aircraft, route, airport or partner does not exist')
  return e instanceof Error ? e : new Error(String(e))
}

function add(a: CascadeSummary, b: CascadeSummary): CascadeSummary {
  return { opened: a.opened + b.opened, updated: a.updated + b.updated, superseded: a.superseded + b.superseded }
}
