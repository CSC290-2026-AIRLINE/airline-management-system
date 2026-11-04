import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

// What Feature 2 needs from Feature 9 (Aircraft). Iteration-03 says these values come from Feature 9's API, which does not
// exist yet. Until it does, DbAircraftDirectory reads Feature 9's tables, read-only, behind this interface (the reviewer's
// decision, so confirm and the gates can run). Swap the provider in the module once Feature 9 publishes its routes.

export const AIRCRAFT_DIRECTORY = Symbol('AIRCRAFT_DIRECTORY')

export type AircraftAvailability =
  | { kind: 'available' }
  /** `rule` is Feature 9's own failing rule (e.g. grounded, in maintenance), shown to staff as is. */
  | { kind: 'unavailable'; rule: string; detail: string }
  | { kind: 'unknown'; detail: string }

/** Aircraft-type values Feature 2 gates on. */
export interface AircraftTypeFacts {
  maxRangeKm: number
  minTurnaroundMinutes: number
}

export interface AircraftDirectory {
  /** false while Feature 9's API is not connected: no aircraft can pass the gates, so nothing that needs them is offered. */
  readonly connected: boolean
  /** Is the aircraft in service for the whole window [from, to)? */
  availability(aircraftId: string, from: Date, to: Date): Promise<AircraftAvailability>
  /** null when Feature 9 cannot tell us yet. */
  typeFacts(aircraftId: string): Promise<AircraftTypeFacts | null>
}

export const F9_NOT_CONNECTED = 'Feature 9 aircraft API is not connected yet'

@Injectable()
export class PendingAircraftDirectory implements AircraftDirectory {
  readonly connected = false

  availability(): Promise<AircraftAvailability> {
    return Promise.resolve({ kind: 'unknown', detail: F9_NOT_CONNECTED })
  }

  typeFacts(): Promise<AircraftTypeFacts | null> {
    return Promise.resolve(null)
  }
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Reads Feature 9's tables, read-only. Dates are compared as UTC days, because the flight window is a UTC instant and
 * Feature 9's periods are calendar days (ponytail: the airport's local day is not used).
 */
@Injectable()
export class DbAircraftDirectory implements AircraftDirectory {
  readonly connected = true

  constructor(private readonly db: DbService) {}

  async availability(aircraftId: string, from: Date, to: Date): Promise<AircraftAvailability> {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      select: { tail_number: true, entry_into_service_date: true, retired_on: true, aircraft_type: { select: { is_active: true } } },
    })
    if (!aircraft) return { kind: 'unavailable', rule: 'aircraft_not_found', detail: 'The aircraft does not exist' }
    const [first, last] = [dayOf(from), dayOf(to)]
    const { tail_number: tail } = aircraft
    if (dayOf(aircraft.entry_into_service_date) > first) {
      return { kind: 'unavailable', rule: 'not_in_service', detail: `${tail} enters service on ${dayOf(aircraft.entry_into_service_date)}` }
    }
    // retired_on is the last day in the fleet.
    if (aircraft.retired_on && dayOf(aircraft.retired_on) < last) {
      return { kind: 'unavailable', rule: 'retired', detail: `${tail} left the fleet on ${dayOf(aircraft.retired_on)}` }
    }
    if (!aircraft.aircraft_type.is_active)
      return { kind: 'unavailable', rule: 'type_inactive', detail: `The type of ${tail} is not active` }

    // No period for a day means in service. end_date is the inclusive last day; null is open-ended.
    const period = await this.db.aircraft_status_period.findFirst({
      where: {
        aircraft_id: aircraftId,
        deleted_at: null,
        status: { not: 'in_service' },
        start_date: { lte: new Date(last) },
        OR: [{ end_date: null }, { end_date: { gte: new Date(first) } }],
      },
      orderBy: { start_date: 'asc' },
      select: { status: true, reason: true, start_date: true, end_date: true },
    })
    if (period) {
      const until = period.end_date ? dayOf(period.end_date) : 'further notice'
      const why = period.reason ? `: ${period.reason}` : ''
      return {
        kind: 'unavailable',
        rule: period.status,
        detail: `${tail} is ${period.status.replace('_', ' ')} from ${dayOf(period.start_date)} to ${until}${why}`,
      }
    }
    return { kind: 'available' }
  }

  async typeFacts(aircraftId: string): Promise<AircraftTypeFacts | null> {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      select: { aircraft_type: { select: { max_range_km: true, min_turnaround_minutes: true } } },
    })
    if (!aircraft) return null
    return { maxRangeKm: aircraft.aircraft_type.max_range_km, minTurnaroundMinutes: aircraft.aircraft_type.min_turnaround_minutes }
  }
}
