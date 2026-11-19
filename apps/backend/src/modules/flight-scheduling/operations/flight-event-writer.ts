import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'
import type { BuiltFlightEvent } from './flight-events'

export type Tx = Prisma.TransactionClient

/** Flight columns an event may move, written in the same transaction as the event. */
export interface FlightChange {
  dep_at?: Date
  arr_at?: Date
  scheduled_dep_at?: Date
  scheduled_arr_at?: Date
  actual_destination?: string
  aircraft_id?: string
}

/**
 * Serialises writers per aircraft for the turnaround buffer, which the schema's exclusion constraint cannot express.
 * Schedule Builder's confirm and every Operations write that moves or reassigns a flight must take this same lock.
 */
export async function lockAircraft(tx: Tx, aircraftId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`flight-scheduling:aircraft:${aircraftId}`}, 0))`
}

/** Row-locks one flight for the rest of the transaction, so two disruptions on it cannot interleave. */
export async function lockFlight(tx: Tx, flightId: string): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM flight WHERE id = ${flightId}::uuid FOR UPDATE`
}

@Injectable()
export class FlightEventWriter {
  constructor(@Inject(FLIGHT_CLOCK) private readonly clock: FlightClock) {}

  /**
   * Appends one event and its outbox row, and applies the event's status and `change` to the flight. Must run inside the
   * caller's transaction, after the caller has taken its locks, so the three writes commit or roll back together.
   */
  async append(tx: Tx, flightId: string, event: BuiltFlightEvent, actorId: string | null, change: FlightChange = {}) {
    const row = await tx.flight_event.create({
      data: { ...event.columns, flight_id: flightId, actor_id: actorId, occurred_at: this.clock.now() },
    })
    await tx.flight_event_outbox.create({ data: { event_id: row.id } })

    const data = { ...change, ...(event.status && { status: event.status }) }
    // updated_at is audit metadata, not a business timestamp, so the real clock is fine here (as in the rest of the module).
    if (Object.keys(data).length) await tx.flight.update({ where: { id: flightId }, data: { ...data, updated_at: new Date() } })
    return row
  }
}
