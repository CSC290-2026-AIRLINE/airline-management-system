import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { type AircraftLeg, findDelayCascade, findPositionBreaks } from './aircraft-feasibility'
import { AircraftFeasibilityService } from './aircraft-feasibility.service'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'
import type { Tx } from './flight-event-writer'

// Kinds this detector owns. aircraft_unavailable (Feature 9 re-check) and congestion come from other checks.
const OWNED_KINDS = ['cascade', 'aircraft_position']
// Flights that can still be affected by a change to the chain.
const OPEN_STATUSES = ['scheduled', 'delayed', 'holding', 'diverted']

export interface CascadeSummary {
  opened: number
  updated: number
  superseded: number
}

/**
 * The event that triggered the re-check. Iteration-03 raises conflicts on specific triggers, and a re-check otherwise only
 * updates an open conflict or supersedes it: a delay raises `cascade` on the later flights it breaks, and a diversion raises
 * `aircraft_position` on the flight after the diverted one. Any other event (hold, cancel, aircraft change, reschedule)
 * never opens a conflict here, so a conflict staff dismissed is not raised again by an unrelated event.
 */
export interface CascadeTrigger {
  flightId: string
  eventId: string
  eventType: string
}

interface Wanted {
  flightId: string
  kind: 'cascade' | 'aircraft_position'
  detail: string
  facts: Prisma.InputJsonObject
  causedByEventId: string | null
  /** Whether this trigger may open a new row; when false the break only keeps an existing open row alive. */
  mayOpen: boolean
}

/**
 * Keeps schedule_conflict in step with one aircraft's chain after an event. A delay walks the later flights and raises
 * `cascade` conflicts linked to the delay event; open cascades from earlier delays are walked again from their cause; a
 * flight whose previous flight ends elsewhere gets `aircraft_position`. One open conflict per flight and kind: a re-check
 * updates it, and closes it as superseded when the cause is gone. Detects only; it never moves a flight.
 */
@Injectable()
export class CascadeDetector {
  constructor(
    private readonly feasibility: AircraftFeasibilityService,
    @Inject(FLIGHT_CLOCK) private readonly clock: FlightClock,
  ) {}

  async refresh(tx: Tx, aircraftId: string, trigger: CascadeTrigger | null): Promise<CascadeSummary> {
    const now = this.clock.now()
    const flights = await tx.flight.findMany({
      where: { aircraft_id: aircraftId, status: { not: 'cancelled' } },
      orderBy: { scheduled_dep_at: 'asc' },
      select: {
        id: true,
        flight_number: true,
        status: true,
        scheduled_dep_at: true,
        dep_at: true,
        arr_at: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true } },
      },
    })
    const legs: AircraftLeg[] = flights.map((f) => ({
      flightId: f.id,
      flightNumber: f.flight_number,
      origin: f.route.origin,
      destination: f.actual_destination ?? f.route.destination,
      scheduledDepAt: f.scheduled_dep_at,
      depAt: f.dep_at,
      arrAt: f.arr_at,
    }))
    const affectable = new Set(flights.filter((f) => OPEN_STATUSES.includes(f.status)).map((f) => f.id))
    const required = await this.feasibility.turnaroundResolver(
      tx,
      aircraftId,
      legs.flatMap((l) => [l.origin, l.destination]),
    )

    const existing = await tx.schedule_conflict.findMany({
      where: { flight_id: { in: flights.map((f) => f.id) }, kind: { in: OWNED_KINDS }, status: 'open' },
      select: {
        id: true,
        flight_id: true,
        kind: true,
        caused_by_event_id: true,
        flight_event_schedule_conflict_caused_by_event_idToflight_event: { select: { flight_id: true } },
      },
    })

    // Every delayed flight whose cascade must be (re)walked, with the delay event it is linked to.
    const causes = new Map<string, string>()
    for (const c of existing) {
      const causeFlight = c.flight_event_schedule_conflict_caused_by_event_idToflight_event?.flight_id
      if (c.kind === 'cascade' && causeFlight && c.caused_by_event_id) causes.set(causeFlight, c.caused_by_event_id)
    }
    const delayed = trigger?.eventType === 'delayed' ? trigger.flightId : null
    if (trigger && delayed) causes.set(delayed, trigger.eventId)

    const wanted = new Map<string, Wanted>()
    const key = (flightId: string, kind: string) => `${flightId}|${kind}`
    // Earliest cause first, so a flight broken by two delays is linked to the one nearest the start of the chain.
    for (const cause of legs.filter((l) => l.flightId && causes.has(l.flightId))) {
      const causeFlightId = cause.flightId as string
      for (const b of findDelayCascade(legs, causeFlightId, required)) {
        if (!b.flightId || !affectable.has(b.flightId) || wanted.has(key(b.flightId, 'cascade'))) continue
        const { detail, flightId, previousArrAt, depAt, ...rest } = b
        wanted.set(key(flightId, 'cascade'), {
          flightId,
          kind: 'cascade',
          detail,
          facts: { ...rest, previousArrAt: previousArrAt.toISOString(), depAt: depAt.toISOString() },
          causedByEventId: causes.get(causeFlightId) ?? null,
          mayOpen: causeFlightId === delayed,
        })
      }
    }

    // Position from the last flight that has landed, so the first open flight is still checked against where it starts.
    const lastLanded = Math.max(
      legs.findLastIndex((l) => l.arrAt <= now),
      0,
    )
    for (const b of findPositionBreaks(legs.slice(lastLanded))) {
      if (!b.flightId || !affectable.has(b.flightId)) continue
      const { kind, detail, ...facts } = b.violation
      wanted.set(key(b.flightId, kind), {
        flightId: b.flightId,
        kind,
        detail,
        facts,
        causedByEventId: trigger?.eventId ?? null,
        mayOpen: trigger?.eventType === 'diverted' && b.violation.otherFlightId === trigger.flightId,
      })
    }

    const summary: CascadeSummary = { opened: 0, updated: 0, superseded: 0 }
    const open = new Map(existing.map((c) => [key(c.flight_id, c.kind), c]))
    for (const [k, w] of wanted) {
      const current = open.get(k)
      if (current) {
        await tx.schedule_conflict.update({
          where: { id: current.id },
          data: {
            detail: w.detail,
            facts: w.facts,
            // A cascade follows its cause's latest delay; a position conflict keeps the event that first raised it.
            ...(w.kind === 'cascade' && { caused_by_event_id: w.causedByEventId }),
            updated_at: new Date(),
          },
        })
        summary.updated++
      } else if (w.mayOpen) {
        await tx.schedule_conflict.create({
          data: {
            flight_id: w.flightId,
            kind: w.kind,
            detail: w.detail,
            facts: w.facts,
            detected_at: now,
            caused_by_event_id: w.causedByEventId,
          },
        })
        summary.opened++
      }
    }

    const gone = existing.filter((c) => !wanted.has(key(c.flight_id, c.kind))).map((c) => c.id)
    if (gone.length) {
      await tx.schedule_conflict.updateMany({ where: { id: { in: gone } }, data: { status: 'superseded', updated_at: new Date() } })
      summary.superseded = gone.length
    }
    return summary
  }

  /** A flight that left the chain (cancelled, or moved to another aircraft): its own open chain conflicts no longer apply. */
  async supersedeForFlight(tx: Tx, flightId: string): Promise<number> {
    const { count } = await tx.schedule_conflict.updateMany({
      where: { flight_id: flightId, kind: { in: OWNED_KINDS }, status: 'open' },
      data: { status: 'superseded', updated_at: new Date() },
    })
    return count
  }
}
