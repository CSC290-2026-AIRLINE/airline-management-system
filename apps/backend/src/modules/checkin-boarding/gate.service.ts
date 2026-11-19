import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from './actor'
import type {
  AddGatesResult,
  AirportGateCount,
  FlightSummary,
  GateInfo,
  GateList,
  GateListEntry,
  Headcount,
  RejectReason,
  ScanResult,
} from './api-types'
import { cancelCheckIn } from './cancel-check-in'
import { CheckInService } from './checkin.service'
import { decideScan } from './domain/boarding'
import { computeWindow } from './domain/window'
import { CheckInError, conflict, invalidState, notFound, validation } from './errors'
import { toFlightSummary, toGateInfo, toGateList, toHeadcount } from './mappers'
import { AUDIT, BOOKINGS, CLOCK, FLIGHTS, NOTIFY, POLICE, SCREENING, SEATS, SENSOR, SETTINGS } from './providers/providers'
import type {
  AuditProvider,
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  NotifyProvider,
  PoliceProvider,
  ScreeningProvider,
  SeatProvider,
  SensorProvider,
  SettingsProvider,
} from './providers/providers'
import type { BoardingEventRecord } from './store/checkin-store'
import { CHECKIN_REPOSITORY } from './store/checkin-repository'
import type { CheckInRepository } from './store/checkin-repository'

/** The passengers board in their boarding group, and inside a group in the order of their surname. */
function surnameOf(passengerName: string): string {
  return passengerName.trim().split(/\s+/).pop() ?? passengerName
}

const passIdsWith = (events: BoardingEventRecord[], kinds: string[]): Set<string> =>
  new Set(events.filter((e) => kinds.includes(e.event) && e.boarding_pass_id).map((e) => e.boarding_pass_id as string))
const boardedPassIds = (events: BoardingEventRecord[]) => passIdsWith(events, ['boarded'])
/** A pass that boarded or no-showed is final: the unique index allows no second final event. */
const finalPassIds = (events: BoardingEventRecord[]) => passIdsWith(events, ['boarded', 'no_show'])

/** A gate code is 1 to 4 letters or digits, like A1 or 12. */
const GATE_CODE = /^[A-Z0-9]{1,4}$/

/**
 * The gate of feature 6: the agent calls the groups, scans the boarding passes, watches the head-count and
 * closes the gate. The boarding rules live in domain/boarding, the other features behind a provider.
 */
@Injectable()
export class GateService {
  constructor(
    @Inject(CLOCK) private readonly clock: ClockProvider,
    @Inject(FLIGHTS) private readonly flightProvider: FlightProvider,
    @Inject(BOOKINGS) private readonly bookings: BookingProvider,
    @Inject(POLICE) private readonly police: PoliceProvider,
    @Inject(SEATS) private readonly seats: SeatProvider,
    @Inject(SCREENING) private readonly screening: ScreeningProvider,
    @Inject(SENSOR) private readonly sensor: SensorProvider,
    @Inject(NOTIFY) private readonly notify: NotifyProvider,
    @Inject(AUDIT) private readonly audit: AuditProvider,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
    private readonly checkins: CheckInService,
    @Inject(CHECKIN_REPOSITORY) private readonly store: CheckInRepository,
  ) {}

  /** The gates of one airport, number-aware; the turned-off ones only when every gate is asked for. */
  async gates(airportCode: string, all = false): Promise<GateInfo[]> {
    const code = airportCode.trim().toUpperCase()
    const gates = (await this.store.listGates()).filter((gate) => gate.airport_code.toUpperCase() === code && (all || gate.is_active))
    const flights = await this.openFlightsByGate()
    return gates
      .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
      .map((gate) => toGateInfo(gate, flights.get(gate.id) ?? null))
  }

  /** The turned-on gates of every airport, the airports without gates included. */
  async gateCounts(): Promise<AirportGateCount[]> {
    const gates = await this.store.listGates()
    const airports = await this.flightProvider.airports()
    return airports.map((airport) => ({
      airportCode: airport.code,
      city: airport.city,
      gates: gates.filter((gate) => gate.airport_code.toUpperCase() === airport.code.toUpperCase() && gate.is_active).length,
    }))
  }

  /** Adds gates to an airport; the codes that are already there are skipped, the bad ones are refused. */
  async addGates(actor: Actor, airportCode: string, codes: string[]): Promise<AddGatesResult> {
    this.staffIdOf(actor)
    const airport = (await this.flightProvider.airports()).find((a) => a.code === airportCode.trim().toUpperCase())
    if (!airport) throw notFound('Airport')
    const bad = codes.filter((code) => !GATE_CODE.test(code))
    if (bad.length > 0) {
      throw new CheckInError(400, 'INVALID_GATE_CODE', 'A gate code is 1 to 4 letters or digits', { codes: bad })
    }
    const there = (await this.store.listGates()).filter((gate) => gate.airport_code === airport.code).map((gate) => gate.code)
    const wanted = [...new Set(codes)]
    const skipped = wanted.filter((code) => there.includes(code))
    const fresh = wanted.filter((code) => !there.includes(code))
    if (fresh.length === 0) throw conflict('GATE_EXISTS', 'These gates are already there', { skipped })

    const added = (await this.store.createGates(airport.code, fresh)).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
    // Another request wrote the same codes first: nothing was added, so nothing is audited.
    if (added.length === 0) throw conflict('GATE_EXISTS', 'These gates are already there', { skipped: wanted })
    await this.audit.record({
      actorType: 'staff',
      actorId: actor.userId,
      action: 'gate.create',
      entityType: 'airport',
      entityId: airport.code,
      summary: `gates ${added.map((gate) => gate.code).join(', ')} added at ${airport.code}`,
      after: { codes: added.map((gate) => gate.code) },
    })
    return { added: added.map((gate) => toGateInfo(gate)), skipped }
  }

  /** Turns a gate on or off; a gate with a flight on it stays on until the flight moves. */
  async setGateActive(actor: Actor, gateId: string, isActive: boolean): Promise<GateInfo> {
    this.staffIdOf(actor)
    const gate = await this.store.getGate(gateId)
    if (!gate) throw notFound('Gate')
    if (!isActive) {
      const flight = await this.openFlightOf(gate.id)
      if (flight)
        throw conflict('GATE_IN_USE', `${flight.flightNumber} is at this gate, move it first`, { flightNumber: flight.flightNumber })
    }
    const updated = await this.store.setGateActive(gate.id, isActive)
    await this.audit.record({
      actorType: 'staff',
      actorId: actor.userId,
      action: 'gate.update',
      entityType: 'airport',
      entityId: updated.airport_code,
      summary: `gate ${updated.code} turned ${isActive ? 'on' : 'off'} at ${updated.airport_code}`,
      before: { code: gate.code, isActive: gate.is_active },
      after: { code: updated.code, isActive },
    })
    const flights = await this.openFlightsByGate()
    return toGateInfo(updated, flights.get(updated.id) ?? null)
  }

  /** The flights of the day, each with the gate it boards at. */
  async flights(): Promise<FlightSummary[]> {
    const summaries: FlightSummary[] = []
    for (const flight of await this.flightProvider.list()) {
      summaries.push(await this.flightSummaryOf(flight))
    }
    return summaries
  }

  /** Moves a flight to another gate. Feature 6 owns the gates, feature 13 is told about the change. */
  async setGate(actor: Actor, flightId: string, input: { gateId: string }): Promise<FlightSummary> {
    this.staffIdOf(actor)
    const gate = await this.store.getGate(input.gateId)
    if (!gate) throw notFound('Gate')
    const flight = await this.flightOf(flightId)
    const boarding = await this.store.flightBoarding(flightId)
    if (boarding?.closed_at) throw invalidState('The gate of this flight is closed')
    // A cancelled or departed flight keeps the gate it has, but it never gets its first one.
    if (!boarding && !this.stillBoards(flight)) {
      throw invalidState('A cancelled or departed flight cannot be given a gate')
    }
    if (!gate.is_active) throw conflict('GATE_INACTIVE', 'This gate is turned off', { gateId: gate.id })
    if (gate.airport_code !== flight.origin.code) {
      throw validation(`This gate is at ${gate.airport_code} and ${flight.flightNumber} departs from ${flight.origin.code}`)
    }

    const from = boarding ? await this.store.getGate(boarding.gate_id) : null
    if (boarding?.gate_id === gate.id) return this.flightSummaryOf(flight)
    const taken = await this.openFlightOf(gate.id)
    // shortcut: two agents moving two flights to the same free gate at the same instant can both pass this check;
    // a partial unique index on the open boardings of a gate would close it (needs the database team).
    if (taken && taken.id !== flightId) {
      throw conflict('GATE_TAKEN', `${taken.flightNumber} is at this gate`, { flightNumber: taken.flightNumber })
    }

    await this.store.upsertFlightBoarding(flightId, gate.id)
    await this.notify.send('gate_changed', { flightId, from: from?.code ?? null, to: gate.code })
    await this.audit.record({
      actorType: 'staff',
      actorId: actor.userId,
      action: 'gate.change',
      entityType: 'flight',
      entityId: flightId,
      summary: `gate ${from?.code ?? 'none'} to ${gate.code}`,
      before: { gateId: from?.id ?? null, gate: from?.code ?? null },
      after: { gateId: gate.id, gate: gate.code },
    })
    return this.flightSummaryOf(flight)
  }

  /** The passenger list of the gate: the air marshals first, then the four boarding groups. */
  async passengerList(actor: Actor, gateId: string, flightId: string): Promise<GateList> {
    this.staffIdOf(actor)
    const gate = await this.store.getGate(gateId)
    if (!gate) throw notFound('Gate')
    const boarding = await this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.gate_id !== gateId) {
      throw validation('This flight is not at this gate', { correctGate: await this.gateCodeOf(boarding.gate_id) })
    }
    const flight = await this.flightOf(flightId)
    const policeIds = await this.police.policePassengerIds(flightId)
    const events = await this.store.listEvents(flightId)
    const boarded = boardedPassIds(events)

    const entries: GateListEntry[] = []
    const records = await this.store.listCheckInsByFlight(flightId)
    const [bookings, passes] = await Promise.all([
      Promise.all(records.map((record) => this.bookings.byBookingPassengerId(record.booking_passenger_id, record.flight_id))),
      this.store.passesForCheckIns(records.map((record) => record.id)),
    ])
    for (const [index, record] of records.entries()) {
      const pass = passes.find((p) => p.check_in_id === record.id)
      if (!pass) continue
      const booking = bookings[index]
      entries.push({
        checkInId: record.id,
        boardingPassId: pass.id,
        reference: pass.reference,
        passengerName: this.nameOf(booking),
        seat: pass.seat_code,
        boardingGroup: pass.boarding_group,
        specialAssistance: booking?.specialAssistance ?? [],
        isPolice: Boolean(booking?.isPolice) || policeIds.includes(record.passenger_id),
        boarded: boarded.has(pass.id),
        status: record.status,
      })
    }
    entries.sort((a, b) => a.boardingGroup - b.boardingGroup || surnameOf(a.passengerName).localeCompare(surnameOf(b.passengerName)))

    return toGateList({
      gate: { id: gate.id, code: gate.code },
      flight: await this.flightSummaryOf(flight),
      closedAt: boarding.closed_at?.toISOString() ?? null,
      boardedCount: boarded.size,
      entries,
    })
  }

  /** Scans a boarding pass at the gate: the passenger boards, or the agent is told why not. */
  async scan(actor: Actor, gateId: string, input: { flightId: string; reference: string }): Promise<ScanResult> {
    const staffId = this.staffIdOf(actor)
    const reference = input.reference.trim().toUpperCase()
    const scanned = await this.flightOf(input.flightId)
    if (scanned.status === 'cancelled') throw invalidState('This flight is cancelled')
    const boarding = await this.store.flightBoarding(input.flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.gate_id !== gateId) {
      throw validation('This flight is not at this gate', { correctGate: await this.gateCodeOf(boarding.gate_id) })
    }

    const pass = await this.store.passByReference(reference)
    let record = pass ? await this.store.getCheckIn(pass.check_in_id) : null
    const booking = record ? await this.bookings.byBookingPassengerId(record.booking_passenger_id, record.flight_id) : null
    const passengerName = this.nameOf(booking)
    const passRow = record ? await this.store.flightBoarding(record.flight_id) : null
    // A pass that was closed out is no longer valid, unless the gate itself is closed: then the agent has to
    // see that this flight is done.
    const closedOut = record ? record.status === 'no_show' : false
    if (!pass || !record || (closedOut && !passRow?.closed_at)) {
      await this.store.appendEvent({
        flight_id: input.flightId,
        gate_id: gateId,
        boarding_pass_id: null,
        scanned_reference: reference,
        event: 'rejected',
        reason: 'NOT_FOUND',
        staff_id: staffId,
        occurred_at: this.clock.now(),
      })
      return {
        event: 'rejected',
        reason: 'NOT_FOUND',
        message: `${reference} is not a boarding pass for any flight today.`,
        passenger: null,
        correctGate: null,
      }
    }

    // Features 2 and 3 do not call us when they cancel: the pass of a cancelled flight or booking is cancelled here.
    // A passenger who boarded or was closed out keeps that status.
    record = await this.checkins.refreshCancelled(actor, record)
    // A hold can come after the pass was issued (feature 7 re-screens) and security can lift one at any time: the
    // gate asks where the passenger stands now.
    if (record.status === 'on_hold') {
      record = await this.checkins.refreshHold(actor, record)
    } else if (record.status === 'checked_in') {
      const standing = await this.screening.status({ passengerId: record.passenger_id, flightId: record.flight_id })
      if (standing === 'held' || standing === 'denied') {
        record = await this.store.updateCheckIn(record.id, { status: standing === 'held' ? 'on_hold' : 'denied' })
      }
    }

    const decision = decideScan({
      pass: { flightId: record.flight_id, status: record.status, alreadyFinal: await this.store.hasFinalEvent(pass.id) },
      gateId,
      flightAtGate: input.flightId,
      passFlightGateId: passRow?.gate_id ?? null,
      passFlightClosedAt: passRow?.closed_at ?? null,
    })
    const passenger = { name: passengerName, seat: pass.seat_code, boardingGroup: pass.boarding_group }

    if (decision.event === 'boarded') {
      const written = await this.store.appendEvent({
        flight_id: input.flightId,
        gate_id: gateId,
        boarding_pass_id: pass.id,
        scanned_reference: reference,
        event: 'boarded',
        reason: null,
        staff_id: staffId,
        occurred_at: this.clock.now(),
      })
      if (written.event !== 'boarded') {
        // The unique index won: another agent boarded this pass a moment earlier.
        return {
          event: 'rejected',
          reason: 'ALREADY_BOARDED',
          message: `Already boarded: ${passengerName} was scanned before.`,
          passenger,
          correctGate: null,
        }
      }
      await this.store.updateCheckIn(record.id, { status: 'boarded' })
      await this.audit.record({
        actorType: 'staff',
        actorId: actor.userId,
        action: 'boarding.board',
        entityType: 'boarding_pass',
        entityId: pass.id,
        summary: `${passengerName} boarded ${scanned.flightNumber}`,
      })
      return {
        event: 'boarded',
        reason: null,
        message: `Boarded: ${passengerName}, seat ${pass.seat_code}.`,
        passenger,
        correctGate: null,
      }
    }

    const reason = decision.reason ?? 'NOT_FOUND'
    const correctGate = reason === 'WRONG_GATE' ? await this.gateCodeOf(passRow?.gate_id ?? null) : null
    await this.store.appendEvent({
      flight_id: input.flightId,
      gate_id: gateId,
      boarding_pass_id: pass.id,
      scanned_reference: reference,
      event: 'rejected',
      reason,
      staff_id: staffId,
      occurred_at: this.clock.now(),
    })
    return {
      event: 'rejected',
      reason,
      message: await this.messageOf(reason, passengerName, reference, correctGate, scanned, record.flight_id),
      passenger,
      correctGate,
    }
  }

  /** The head-count of the gate: the sensor reading, the manual count and the number that boarded. */
  async headcount(actor: Actor, flightId: string): Promise<Headcount> {
    this.staffIdOf(actor)
    const boarding = await this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    return toHeadcount({
      flightId,
      gateCode: (await this.gateCodeOf(boarding.gate_id)) ?? '',
      sensorCount: boarding.sensor_count,
      manualCount: boarding.manual_count,
      boardedCount: boarding.boarded_count ?? (await this.boardedCountOf(flightId)),
      closedAt: boarding.closed_at,
    })
  }

  /** Reads the sensor or takes the manual count of the aircraft. */
  async setHeadcount(
    actor: Actor,
    flightId: string,
    input: { source: 'sensor' } | { source: 'manual'; count: number },
  ): Promise<Headcount> {
    this.staffIdOf(actor)
    const boarding = await this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.closed_at) throw invalidState('The gate of this flight is closed')
    if ((await this.flightOf(flightId)).status === 'cancelled') throw invalidState('This flight is cancelled')

    if (input.source === 'sensor') {
      const count = await this.sensor.read(boarding.gate_id, { boardedCount: await this.boardedCountOf(flightId) })
      if (count === null) throw validation('The head-count sensor is not available', { reason: 'sensor_unavailable' })
      await this.store.updateFlightBoarding(flightId, { sensor_count: count })
      await this.audit.record({
        actorType: 'staff',
        actorId: actor.userId,
        action: 'gate.headcount',
        entityType: 'flight',
        entityId: flightId,
        summary: `sensor head-count ${count}`,
        after: { source: 'sensor', count },
      })
    } else {
      if (!Number.isInteger(input.count) || input.count < 0) {
        throw validation('The manual count must be a whole number of zero or more', { count: input.count })
      }
      await this.store.updateFlightBoarding(flightId, { manual_count: input.count })
      await this.audit.record({
        actorType: 'staff',
        actorId: actor.userId,
        action: 'gate.headcount',
        entityType: 'flight',
        entityId: flightId,
        summary: `manual head-count ${input.count}`,
        after: { source: 'manual', count: input.count },
      })
    }
    return this.headcount(actor, flightId)
  }

  /** Closes the gate: the count is frozen, everybody who did not board is a no-show. */
  async closeGate(actor: Actor, flightId: string, input: { confirmMismatch?: boolean }): Promise<Headcount> {
    const staffId = this.staffIdOf(actor)
    const boarding = await this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.closed_at) throw invalidState('The gate of this flight is already closed')
    // A cancelled flight has no gate to close and nobody on it is a no-show.
    const flight = await this.flightOf(flightId)
    if (flight.status === 'cancelled') throw invalidState('This flight is cancelled')

    const count = boarding.manual_count ?? boarding.sensor_count
    if (count === null || count === undefined) {
      throw validation('A head-count is required before the gate can be closed', { reason: 'headcount_required' })
    }
    const boarded = await this.boardedCountOf(flightId)
    const source = boarding.manual_count !== null ? 'manual' : 'sensor'
    if (count !== boarded && !input.confirmMismatch) {
      throw new CheckInError(
        409,
        'HEADCOUNT_MISMATCH',
        `Head-count mismatch: ${boarded} marked boarded, ${count} counted. Check the aircraft, then confirm.`,
        { boardedCount: boarded, count, source },
      )
    }

    const closedAt = this.clock.now()
    let noShow = 0
    const records = await this.store.listCheckInsByFlight(flightId)
    const passes = await this.store.passesForCheckIns(records.map((record) => record.id))
    const final = finalPassIds(await this.store.listEvents(flightId))
    const cancelledBookings = new Set(
      (await this.bookings.listByFlight(flightId)).filter((b) => b.cancelled).map((b) => b.bookingPassengerId),
    )
    for (const record of records) {
      const pass = passes.find((p) => p.check_in_id === record.id)
      if (pass && final.has(pass.id)) continue
      // Feature 3 does not call us when it cancels a booking: a check-in nobody read or scanned since is cancelled here.
      const open = record.status === 'checked_in' || record.status === 'on_hold' || record.status === 'started'
      if (open && cancelledBookings.has(record.booking_passenger_id)) {
        await cancelCheckIn(this.cancelDeps(), actor, record, { flightNumber: flight.flightNumber, why: 'the booking was cancelled' })
        continue
      }
      if (pass) {
        // Only a passenger who could still board is a no-show; a cancelled or denied check-in keeps its status.
        if (record.status !== 'checked_in' && record.status !== 'on_hold') continue
        const written = await this.store.appendEvent({
          flight_id: flightId,
          gate_id: boarding.gate_id,
          boarding_pass_id: pass.id,
          scanned_reference: null,
          event: 'no_show',
          reason: null,
          staff_id: null,
          occurred_at: closedAt,
        })
        // The pass boarded while the gate was closing: it is not a no-show and its bags stay on board.
        if (written.event !== 'no_show') continue
        // A hold nobody cleared before the close gives the seat back.
        if (record.status === 'on_hold') await this.seats.releaseAssigned(record.booking_passenger_id, record.flight_id)
      } else if (record.status === 'started' || record.status === 'on_hold') {
        // Never checked in, so the seat goes back to the pool.
        await this.seats.releaseAssigned(record.booking_passenger_id, record.flight_id)
      } else {
        continue
      }
      await this.store.updateCheckIn(record.id, { status: 'no_show' })
      await this.offloadBags(record.id)
      noShow += 1
    }
    // Closed last, so a close that died halfway can simply be run again; the count is the one frozen at that moment.
    await this.store.updateFlightBoarding(flightId, {
      boarded_count: await this.boardedCountOf(flightId),
      closed_at: closedAt,
      closed_by: staffId,
    })

    await this.notify.send('boarding_call', {
      flightId,
      gate: await this.gateCodeOf(boarding.gate_id),
      boarded,
      noShow,
    })
    await this.audit.record({
      actorType: 'staff',
      actorId: actor.userId,
      action: 'gate.close',
      entityType: 'flight',
      entityId: flightId,
      summary: `gate closed with ${boarded} boarded and ${noShow} no-shows`,
      before: { boarded, count, source },
      after: { closedAt: closedAt.toISOString(), noShow },
    })
    return this.headcount(actor, flightId)
  }

  /** The gate screens are for staff, a customer token may not read them. */
  private staffIdOf(actor: Actor): string {
    if (actor.staffId === null) throw new CheckInError(403, 'FORBIDDEN', 'The gate screens are for staff only')
    return actor.staffId
  }

  /** The name of the passenger behind a booking; the check-in row does not carry it. */
  private nameOf(booking: BookingPassenger | null): string {
    return booking ? `${booking.firstName} ${booking.lastName}` : ''
  }

  private async flightOf(flightId: string): Promise<FlightRecord> {
    const flight = await this.flightProvider.byId(flightId)
    if (!flight) throw notFound('Flight')
    return flight
  }

  private async flightSummaryOf(flight: FlightRecord): Promise<FlightSummary> {
    const window = computeWindow(flight.depAt, await this.settings.window())
    const boarding = await this.store.flightBoarding(flight.id)
    const gate = boarding ? await this.store.getGate(boarding.gate_id) : null
    return toFlightSummary(flight, gate ? { id: gate.id, code: gate.code } : null, window.boardingAt)
  }

  private async gateCodeOf(gateId: string | null): Promise<string | null> {
    if (!gateId) return null
    const gate = await this.store.getGate(gateId)
    return gate?.code ?? null
  }

  /**
   * A flight boards while it is scheduled or delayed and has not left. Feature 2 has no job yet that writes "departed"
   * when the departure time passes, so the time decides as well, the way features 2 and 7 read it.
   */
  private stillBoards(flight: FlightRecord): boolean {
    return (flight.status === 'scheduled' || flight.status === 'delayed') && flight.depAt.getTime() > this.clock.now().getTime()
  }

  /**
   * The flights that still board, by gate id. A closed gate is done, and a flight that was cancelled, departed or
   * arrived frees its gate even when nobody closed it.
   */
  private async openFlightsByGate(): Promise<Map<string, NonNullable<GateInfo['flight']>>> {
    const boardings = await this.store.openFlightBoardings()
    const byId = new Map((await this.flightProvider.byIds(boardings.map((b) => b.flight_id))).map((flight) => [flight.id, flight]))
    const flights = new Map<string, NonNullable<GateInfo['flight']>>()
    for (const boarding of boardings) {
      const flight = byId.get(boarding.flight_id)
      if (!flight || !this.stillBoards(flight)) continue
      flights.set(boarding.gate_id, { id: flight.id, flightNumber: flight.flightNumber, depAt: flight.depAt.toISOString() })
    }
    return flights
  }

  /** The flight that boards at the gate now, if any. */
  private async openFlightOf(gateId: string): Promise<NonNullable<GateInfo['flight']> | null> {
    return (await this.openFlightsByGate()).get(gateId) ?? null
  }

  private async boardedCountOf(flightId: string): Promise<number> {
    return (await this.store.listEvents(flightId)).filter((e) => e.event === 'boarded').length
  }

  private cancelDeps() {
    return { store: this.store, notify: this.notify, audit: this.audit }
  }

  private async offloadBags(checkInId: string): Promise<void> {
    for (const bag of await this.store.listBags(checkInId)) {
      if (bag.status !== 'offloaded') await this.store.updateBag(bag.id, { status: 'offloaded' })
    }
  }

  private async messageOf(
    reason: RejectReason,
    name: string,
    reference: string,
    correctGate: string | null,
    scanned: FlightRecord,
    passFlightId: string,
  ): Promise<string> {
    const passFlight = await this.flightProvider.byId(passFlightId)
    switch (reason) {
      case 'WRONG_GATE':
        return `Wrong gate. ${name} is on ${passFlight?.flightNumber ?? 'this flight'}. Send them to gate ${correctGate}.`
      case 'WRONG_FLIGHT':
        return `${name} holds a pass for ${passFlight?.flightNumber ?? 'another flight'} on ${passFlight?.serviceDate ?? ''}, not this flight.`
      case 'GATE_CLOSED':
        return `Gate closed. No more boarding for ${scanned.flightNumber}.`
      case 'ALREADY_BOARDED':
        return `Already boarded: ${name} was scanned before.`
      case 'ON_HOLD':
        return `On hold: do not board ${name}. Ask them to wait for security staff.`
      case 'CANCELLED':
        return `Cancelled: the check-in of ${name} was cancelled, this pass does not board.`
      default:
        return `${reference} is not a boarding pass for any flight today.`
    }
  }
}
