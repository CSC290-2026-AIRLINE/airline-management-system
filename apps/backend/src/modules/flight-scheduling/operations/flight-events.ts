// Typed builders for flight_event rows. Each event type carries exactly the columns it needs, and says what flight.status
// becomes, so the writer never assembles a half-filled row. Types match the flight_event.type CHECK in the schema.

export type FlightStatus = 'scheduled' | 'delayed' | 'holding' | 'diverted' | 'cancelled' | 'departed' | 'arrived'

export type CancelResolution = 'refund' | 'rebook_partner'

export type FlightEventInput =
  | { type: 'created'; depAt: Date; arrAt: Date; aircraftId: string; note?: string }
  | { type: 'delayed'; reasonCode: string; delayMinutes: number; oldDepAt: Date; oldArrAt: Date; note?: string }
  | { type: 'rescheduled'; oldDepAt: Date; newDepAt: Date; oldArrAt: Date; newArrAt: Date; reasonCode?: string; note?: string }
  | { type: 'aircraft_changed'; oldAircraftId: string; newAircraftId: string; note?: string }
  | { type: 'holding'; reasonCode: string; holdMinutes: number; oldArrAt: Date; note?: string }
  | { type: 'hold_ended'; note?: string }
  | { type: 'diverted'; reasonCode: string; newDestination: string; note?: string }
  | { type: 'cancelled'; reasonCode: string; resolution: CancelResolution; partnerAirline?: string; note?: string }

/** The flight_event columns a builder fills; flight_id, actor_id and occurred_at are added by the writer. */
export interface FlightEventColumns {
  type: FlightEventInput['type']
  disruption_reason_code: string | null
  delay_minutes: number | null
  old_dep_at: Date | null
  new_dep_at: Date | null
  old_arr_at: Date | null
  new_arr_at: Date | null
  new_destination: string | null
  old_aircraft_id: string | null
  new_aircraft_id: string | null
  hold_minutes: number | null
  resolution: CancelResolution | null
  partner_airline: string | null
  note: string | null
}

export interface BuiltFlightEvent {
  columns: FlightEventColumns
  /** flight.status after the event; null leaves it unchanged (an aircraft change does not alter the status). */
  status: FlightStatus | null
}

export class InvalidFlightEventError extends Error {}

const MINUTE_MS = 60_000

const EMPTY: Omit<FlightEventColumns, 'type'> = {
  disruption_reason_code: null,
  delay_minutes: null,
  old_dep_at: null,
  new_dep_at: null,
  old_arr_at: null,
  new_arr_at: null,
  new_destination: null,
  old_aircraft_id: null,
  new_aircraft_id: null,
  hold_minutes: null,
  resolution: null,
  partner_airline: null,
  note: null,
}

function positiveMinutes(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) throw new InvalidFlightEventError(`${name} must be a positive whole number of minutes`)
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new InvalidFlightEventError(`${name} is required`)
  return value
}

export function buildFlightEvent(input: FlightEventInput): BuiltFlightEvent {
  const note = input.note?.trim() || null
  const base = { ...EMPTY, type: input.type, note }

  switch (input.type) {
    case 'created':
      return {
        columns: { ...base, new_dep_at: input.depAt, new_arr_at: input.arrAt, new_aircraft_id: input.aircraftId },
        status: 'scheduled',
      }
    case 'delayed': {
      positiveMinutes(input.delayMinutes, 'delay_minutes')
      const shift = input.delayMinutes * MINUTE_MS
      return {
        columns: {
          ...base,
          disruption_reason_code: required(input.reasonCode, 'reason_code'),
          delay_minutes: input.delayMinutes,
          old_dep_at: input.oldDepAt,
          new_dep_at: new Date(input.oldDepAt.getTime() + shift),
          old_arr_at: input.oldArrAt,
          new_arr_at: new Date(input.oldArrAt.getTime() + shift),
        },
        status: 'delayed',
      }
    }
    case 'rescheduled':
      if (!(input.newArrAt > input.newDepAt)) throw new InvalidFlightEventError('arrival must be after departure')
      return {
        columns: {
          ...base,
          disruption_reason_code: input.reasonCode ?? null,
          old_dep_at: input.oldDepAt,
          new_dep_at: input.newDepAt,
          old_arr_at: input.oldArrAt,
          new_arr_at: input.newArrAt,
        },
        status: 'scheduled',
      }
    case 'aircraft_changed':
      if (input.oldAircraftId === input.newAircraftId) throw new InvalidFlightEventError('new aircraft is the same as the current one')
      return { columns: { ...base, old_aircraft_id: input.oldAircraftId, new_aircraft_id: input.newAircraftId }, status: null }
    case 'holding':
      // Holding extends the arrival time; the hold always carries its reason (Iteration-03).
      positiveMinutes(input.holdMinutes, 'hold_minutes')
      return {
        columns: {
          ...base,
          disruption_reason_code: required(input.reasonCode, 'reason_code'),
          hold_minutes: input.holdMinutes,
          old_arr_at: input.oldArrAt,
          new_arr_at: new Date(input.oldArrAt.getTime() + input.holdMinutes * MINUTE_MS),
        },
        status: 'holding',
      }
    case 'hold_ended':
      return { columns: base, status: 'departed' }
    case 'diverted':
      return {
        columns: {
          ...base,
          disruption_reason_code: required(input.reasonCode, 'reason_code'),
          new_destination: required(input.newDestination, 'new_destination'),
        },
        status: 'diverted',
      }
    case 'cancelled':
      if (input.resolution === 'rebook_partner' && !input.partnerAirline) {
        throw new InvalidFlightEventError('partner_airline is required to rebook on a partner')
      }
      return {
        columns: {
          ...base,
          disruption_reason_code: required(input.reasonCode, 'reason_code'),
          resolution: input.resolution,
          partner_airline: input.resolution === 'rebook_partner' ? (input.partnerAirline ?? null) : null,
        },
        status: 'cancelled',
      }
  }
}
