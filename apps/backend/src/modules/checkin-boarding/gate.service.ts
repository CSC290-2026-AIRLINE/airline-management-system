import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from './actor'
import type { FlightSummary, GateInfo, GateList, GateListEntry, Headcount, RejectReason, ScanResult } from './api-types'
import { decideScan } from './domain/boarding'
import { computeWindow } from './domain/window'
import { CheckInError, invalidState, notFound, validation } from './errors'
import { toFlightSummary, toGateInfo, toGateList, toHeadcount } from './mappers'
import { AUDIT, BOOKINGS, CLOCK, FLIGHTS, NOTIFY, POLICE, SEATS, SENSOR, SETTINGS } from './providers/providers'
import type {
  AuditProvider,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  NotifyProvider,
  PoliceProvider,
  SeatProvider,
  SensorProvider,
  SettingsProvider,
} from './providers/providers'
import { CheckInStore } from './store/checkin-store'

/** The passengers board in their boarding group, and inside a group in the order of their surname. */
function surnameOf(passengerName: string): string {
  return passengerName.trim().split(/\s+/).pop() ?? passengerName
}

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
    @Inject(SENSOR) private readonly sensor: SensorProvider,
    @Inject(NOTIFY) private readonly notify: NotifyProvider,
    @Inject(AUDIT) private readonly audit: AuditProvider,
    @Inject(SETTINGS) private readonly settings: SettingsProvider,
    private readonly store: CheckInStore,
  ) {}

  /** The gates of the airport. */
  gates(): Promise<GateInfo[]> {
    return Promise.resolve(this.store.listGates().map(toGateInfo))
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
    const gate = this.store.getGate(input.gateId)
    if (!gate) throw notFound('Gate')
    if (!gate.is_active) throw validation('This gate is not active', { gateId: gate.id })
    const flight = await this.flightOf(flightId)
    const boarding = this.store.flightBoarding(flightId)
    if (boarding?.closed_at) throw invalidState('The gate of this flight is closed')

    const from = boarding ? this.store.getGate(boarding.gate_id) : null
    if (boarding?.gate_id === gate.id) return this.flightSummaryOf(flight)

    this.store.upsertFlightBoarding(flightId, gate.id)
    await this.notify.send('gate_change', { flightId, from: from?.code ?? null, to: gate.code })
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
    const gate = this.store.getGate(gateId)
    if (!gate) throw notFound('Gate')
    const boarding = this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.gate_id !== gateId) {
      throw validation('This flight is not at this gate', { correctGate: this.gateCodeOf(boarding.gate_id) })
    }
    const flight = await this.flightOf(flightId)
    const policeIds = await this.police.policePassengerIds(flightId)
    const boarded = this.boardedPassIds(flightId)

    const entries: GateListEntry[] = []
    for (const record of this.store.listCheckInsByFlight(flightId)) {
      const pass = this.store.passesForCheckIn(record.id)[0]
      if (!pass) continue
      const booking = await this.bookings.byBookingPassengerId(record.booking_passenger_id)
      entries.push({
        checkInId: record.id,
        boardingPassId: pass.id,
        reference: pass.reference,
        passengerName: record.passenger_name,
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
      boardedCount: this.boardedCountOf(flightId),
      entries,
    })
  }

  /** Scans a boarding pass at the gate: the passenger boards, or the agent is told why not. */
  async scan(actor: Actor, gateId: string, input: { flightId: string; reference: string }): Promise<ScanResult> {
    const staffId = this.staffIdOf(actor)
    const reference = input.reference.trim().toUpperCase()
    const scanned = await this.flightOf(input.flightId)
    const boarding = this.store.flightBoarding(input.flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.gate_id !== gateId) {
      throw validation('This flight is not at this gate', { correctGate: this.gateCodeOf(boarding.gate_id) })
    }

    const pass = this.store.passByReference(reference)
    const record = pass ? this.store.getCheckIn(pass.check_in_id) : null
    const passRow = record ? this.store.flightBoarding(record.flight_id) : null
    // A pass that was closed out is no longer valid, unless the gate itself is closed: then the agent has to
    // see that this flight is done.
    const closedOut = record ? record.status === 'cancelled' || record.status === 'no_show' : false
    if (!pass || !record || (closedOut && !passRow?.closed_at)) {
      this.store.appendEvent({
        flight_id: input.flightId,
        gate_id: gateId,
        boarding_pass_id: null,
        scanned_reference: reference,
        event: 'rejected',
        reason: 'NOT_FOUND',
        staff_id: staffId,
      })
      return {
        event: 'rejected',
        reason: 'NOT_FOUND',
        message: `${reference} is not a boarding pass for any flight today.`,
        passenger: null,
        correctGate: null,
      }
    }

    const decision = decideScan({
      pass: { flightId: record.flight_id, status: record.status, alreadyFinal: this.store.hasFinalEvent(pass.id) },
      gateId,
      flightAtGate: input.flightId,
      passFlightGateId: passRow?.gate_id ?? null,
      passFlightClosedAt: passRow?.closed_at ?? null,
    })
    const passenger = { name: record.passenger_name, seat: pass.seat_code, boardingGroup: pass.boarding_group }

    if (decision.event === 'boarded') {
      try {
        this.store.appendEvent({
          flight_id: input.flightId,
          gate_id: gateId,
          boarding_pass_id: pass.id,
          scanned_reference: reference,
          event: 'boarded',
          reason: null,
          staff_id: staffId,
        })
      } catch {
        // The unique index won: another agent boarded this pass a moment earlier.
        this.store.appendEvent({
          flight_id: input.flightId,
          gate_id: gateId,
          boarding_pass_id: pass.id,
          scanned_reference: reference,
          event: 'rejected',
          reason: 'ALREADY_BOARDED',
          staff_id: staffId,
        })
        return {
          event: 'rejected',
          reason: 'ALREADY_BOARDED',
          message: `Already boarded: ${record.passenger_name} was scanned before.`,
          passenger,
          correctGate: null,
        }
      }
      this.store.updateCheckIn(record.id, { status: 'boarded' })
      await this.audit.record({
        actorType: 'staff',
        actorId: actor.userId,
        action: 'boarding.board',
        entityType: 'boarding_pass',
        entityId: pass.id,
        summary: `${record.passenger_name} boarded ${scanned.flightNumber}`,
      })
      return {
        event: 'boarded',
        reason: null,
        message: `Boarded: ${record.passenger_name}, seat ${pass.seat_code}.`,
        passenger,
        correctGate: null,
      }
    }

    const reason = decision.reason ?? 'NOT_FOUND'
    const correctGate = reason === 'WRONG_GATE' ? this.gateCodeOf(passRow?.gate_id ?? null) : null
    this.store.appendEvent({
      flight_id: input.flightId,
      gate_id: gateId,
      boarding_pass_id: pass.id,
      scanned_reference: reference,
      event: 'rejected',
      reason,
      staff_id: staffId,
    })
    return {
      event: 'rejected',
      reason,
      message: await this.messageOf(reason, record.passenger_name, reference, correctGate, scanned, record.flight_id),
      passenger,
      correctGate,
    }
  }

  /** The head-count of the gate: the sensor reading, the manual count and the number that boarded. */
  // eslint-disable-next-line @typescript-eslint/require-await -- async because the route contract is async
  async headcount(actor: Actor, flightId: string): Promise<Headcount> {
    this.staffIdOf(actor)
    const boarding = this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    return toHeadcount({
      flightId,
      gateCode: this.gateCodeOf(boarding.gate_id) ?? '',
      sensorCount: boarding.sensor_count,
      manualCount: boarding.manual_count,
      boardedCount: boarding.boarded_count ?? this.boardedCountOf(flightId),
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
    const boarding = this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.closed_at) throw invalidState('The gate of this flight is closed')

    if (input.source === 'sensor') {
      const count = await this.sensor.read(boarding.gate_id, { boardedCount: this.boardedCountOf(flightId) })
      if (count === null) throw validation('The head-count sensor is not available', { reason: 'sensor_unavailable' })
      this.store.updateFlightBoarding(flightId, { sensor_count: count })
    } else {
      if (!Number.isInteger(input.count) || input.count < 0) {
        throw validation('The manual count must be a whole number of zero or more', { count: input.count })
      }
      this.store.updateFlightBoarding(flightId, { manual_count: input.count })
    }
    return this.headcount(actor, flightId)
  }

  /** Closes the gate: the count is frozen, everybody who did not board is a no-show. */
  async closeGate(actor: Actor, flightId: string, input: { confirmMismatch?: boolean }): Promise<Headcount> {
    const staffId = this.staffIdOf(actor)
    const boarding = this.store.flightBoarding(flightId)
    if (!boarding) throw notFound('Flight boarding')
    if (boarding.closed_at) throw invalidState('The gate of this flight is already closed')

    const count = boarding.manual_count ?? boarding.sensor_count
    if (count === null || count === undefined) {
      throw validation('A head-count is required before the gate can be closed', { reason: 'headcount_required' })
    }
    const boarded = this.boardedCountOf(flightId)
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
    this.store.updateFlightBoarding(flightId, { boarded_count: boarded, closed_at: closedAt, closed_by: staffId })

    let noShow = 0
    for (const record of this.store.listCheckInsByFlight(flightId)) {
      const pass = this.store.passesForCheckIn(record.id)[0]
      if (pass) {
        if (this.store.hasFinalEvent(pass.id)) continue
        this.store.appendEvent({
          flight_id: flightId,
          gate_id: boarding.gate_id,
          boarding_pass_id: pass.id,
          scanned_reference: null,
          event: 'no_show',
          reason: null,
          staff_id: null,
        })
      } else if (record.status === 'started' || record.status === 'on_hold') {
        // Never checked in, so the seat goes back to the pool.
        await this.seats.releaseAssigned(record.booking_passenger_id)
      } else {
        continue
      }
      this.store.updateCheckIn(record.id, { status: 'no_show' })
      this.offloadBags(record.id)
      noShow += 1
    }

    await this.notify.send('boarding_call', {
      flightId,
      gate: this.gateCodeOf(boarding.gate_id),
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

  private async flightOf(flightId: string): Promise<FlightRecord> {
    const flight = await this.flightProvider.byId(flightId)
    if (!flight) throw notFound('Flight')
    return flight
  }

  private async flightSummaryOf(flight: FlightRecord): Promise<FlightSummary> {
    const window = computeWindow(flight.depAt, await this.settings.window())
    const boarding = this.store.flightBoarding(flight.id)
    const gate = boarding ? this.store.getGate(boarding.gate_id) : null
    return toFlightSummary(flight, gate ? { id: gate.id, code: gate.code } : null, window.boardingAt)
  }

  private gateCodeOf(gateId: string | null): string | null {
    if (!gateId) return null
    return this.store.getGate(gateId)?.code ?? null
  }

  private boardedPassIds(flightId: string): Set<string> {
    const ids = new Set<string>()
    for (const event of this.store.listEvents(flightId)) {
      if (event.event === 'boarded' && event.boarding_pass_id) ids.add(event.boarding_pass_id)
    }
    return ids
  }

  private boardedCountOf(flightId: string): number {
    return this.store.listEvents(flightId).filter((e) => e.event === 'boarded').length
  }

  private offloadBags(checkInId: string): void {
    for (const bag of this.store.listBags(checkInId)) {
      if (bag.status !== 'offloaded') this.store.updateBag(bag.id, { status: 'offloaded' })
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
      default:
        return `${reference} is not a boarding pass for any flight today.`
    }
  }
}
