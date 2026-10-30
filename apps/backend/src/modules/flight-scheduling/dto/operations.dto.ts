import { BadRequestException } from '@nestjs/common'
import { parseDate, UUID } from '../pagination'

// Request bodies for Operations writes (disruptions, aircraft change, conflict resolution). Hand-written parsers like the
// rest of the module; every error is collected so staff see all of them at once.

export interface DelayInput {
  reason_code: string
  delay_minutes: number
  note?: string
}

export interface BatchDelayInput extends DelayInput {
  flight_ids: string[]
}

export interface DivertInput {
  reason_code: string
  airport_code: string
  note?: string
}

export interface CancelInput {
  reason_code: string
  resolution: 'refund' | 'rebook_partner'
  partner_airline?: string
  note?: string
}

export interface HoldInput {
  reason_code: string
  hold_minutes: number
  note?: string
}

export interface AircraftChangeInput {
  aircraft_id: string
  note?: string
}

export interface RescheduleInput {
  approval_id: string
  dep_at: Date
  arr_at: Date
  reason_code?: string
  note?: string
}

export type ResolveInput =
  | ({ resolution: 'change_aircraft' } & AircraftChangeInput)
  | ({ resolution: 'reschedule' } & RescheduleInput)
  | { resolution: 'cancel_refund'; reason_code: string; note?: string }
  | { resolution: 'rebook_partner'; reason_code: string; partner_airline: string; note?: string }

export interface ConfirmInput {
  approval_id: string
  route_id: string
  pattern_id?: string
  flight_number: string
  service_date: Date
  aircraft_id: string
  scheduled_dep_at: Date
  scheduled_arr_at: Date
}

export interface DismissInput {
  reason: string
}

// No business maximum is agreed for a delay or a hold; this is only the INTEGER column's limit (flight_event.delay_minutes).
const MAX_INT = 2_147_483_647
const IATA = /^[A-Z]{3}$/

type Body = Record<string, unknown>

function asBody(body: unknown): Body {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('body must be a JSON object')
  return body as Body
}

class Fields {
  readonly errors: string[] = []
  constructor(private readonly body: Body) {}

  text(key: string): string {
    const v = this.body[key]
    if (typeof v !== 'string' || !v.trim()) {
      this.errors.push(`${key} is required`)
      return ''
    }
    return v.trim()
  }

  optionalText(key: string): string | undefined {
    const v = this.body[key]
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'string') {
      this.errors.push(`${key} must be a string`)
      return undefined
    }
    return v.trim() || undefined
  }

  code(key: string): string {
    return this.text(key).toUpperCase()
  }

  iata(key: string): string {
    const v = this.code(key)
    if (v && !IATA.test(v)) this.errors.push(`${key} must be 3 letters`)
    return v
  }

  uuid(key: string): string {
    const v = this.text(key)
    if (v && !UUID.test(v)) this.errors.push(`${key} must be a UUID`)
    return v
  }

  instant(key: string): Date {
    const raw = this.text(key)
    const date = new Date(raw)
    // Require an explicit offset, so a local time is never read as the server's zone.
    if (raw && (Number.isNaN(date.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/.test(raw))) {
      this.errors.push(`${key} must be an ISO 8601 date-time with an offset`)
    }
    return date
  }

  done<T>(value: T): T {
    if (this.errors.length) throw new BadRequestException(this.errors)
    return value
  }
}

function minutes(body: Body, f: Fields, key: string): number {
  const v = body[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_INT)
    f.errors.push(`${key} must be a positive whole number of minutes`)
  return v as number
}

export function parseDelayBody(raw: unknown): DelayInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const reason_code = f.code('reason_code')
  return f.done({ reason_code, delay_minutes: minutes(body, f, 'delay_minutes'), note: f.optionalText('note') })
}

// 50 is a guard against a runaway request, not an agreed business limit.
const MAX_BATCH = 50

export function parseBatchDelayBody(raw: unknown): BatchDelayInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const ids = body.flight_ids
  const flight_ids = Array.isArray(ids) ? [...new Set(ids.map(String))] : []
  if (!Array.isArray(ids) || !flight_ids.length || flight_ids.length > MAX_BATCH)
    f.errors.push(`flight_ids must hold 1 to ${MAX_BATCH} ids`)
  else if (flight_ids.some((id) => !UUID.test(id))) f.errors.push('flight_ids must be UUIDs')
  const reason_code = f.code('reason_code')
  return f.done({ flight_ids, reason_code, delay_minutes: minutes(body, f, 'delay_minutes'), note: f.optionalText('note') })
}

export function parseHoldBody(raw: unknown): HoldInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const reason_code = f.code('reason_code')
  return f.done({ reason_code, hold_minutes: minutes(body, f, 'hold_minutes'), note: f.optionalText('note') })
}

/** Ending a hold takes an optional note only; an empty body is fine. */
export function parseEndHoldBody(raw: unknown): { note?: string } {
  if (raw === undefined || raw === null || (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0)) return {}
  const f = new Fields(asBody(raw))
  return f.done({ note: f.optionalText('note') })
}

export function parseDivertBody(raw: unknown): DivertInput {
  const f = new Fields(asBody(raw))
  return f.done({ reason_code: f.code('reason_code'), airport_code: f.iata('airport_code'), note: f.optionalText('note') })
}

export function parseCancelBody(raw: unknown): CancelInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const reason_code = f.code('reason_code')
  const resolution = body.resolution
  if (resolution !== 'refund' && resolution !== 'rebook_partner') f.errors.push('resolution must be refund or rebook_partner')
  const partner_airline = resolution === 'rebook_partner' ? f.code('partner_airline') : undefined
  return f.done({ reason_code, resolution: resolution as CancelInput['resolution'], partner_airline, note: f.optionalText('note') })
}

export function parseAircraftChangeBody(raw: unknown): AircraftChangeInput {
  const f = new Fields(asBody(raw))
  return f.done({ aircraft_id: f.uuid('aircraft_id'), note: f.optionalText('note') })
}

function rescheduleFields(f: Fields): RescheduleInput {
  const approval_id = f.uuid('approval_id')
  const dep_at = f.instant('dep_at')
  const arr_at = f.instant('arr_at')
  if (!f.errors.length && !(arr_at > dep_at)) f.errors.push('arr_at must be after dep_at')
  const reason_code = f.optionalText('reason_code')?.toUpperCase()
  return { approval_id, dep_at, arr_at, reason_code, note: f.optionalText('note') }
}

export function parseResolveBody(raw: unknown): ResolveInput {
  const body = asBody(raw)
  const f = new Fields(body)
  switch (body.resolution) {
    case 'change_aircraft':
      return f.done({ resolution: 'change_aircraft', aircraft_id: f.uuid('aircraft_id'), note: f.optionalText('note') })
    case 'reschedule':
      return f.done({ resolution: 'reschedule', ...rescheduleFields(f) })
    case 'cancel_refund':
      return f.done({ resolution: 'cancel_refund', reason_code: f.code('reason_code'), note: f.optionalText('note') })
    case 'rebook_partner':
      return f.done({
        resolution: 'rebook_partner',
        reason_code: f.code('reason_code'),
        partner_airline: f.code('partner_airline'),
        note: f.optionalText('note'),
      })
    default:
      throw new BadRequestException('resolution must be change_aircraft, reschedule, cancel_refund or rebook_partner')
  }
}

export function parseDismissBody(raw: unknown): DismissInput {
  const f = new Fields(asBody(raw))
  return f.done({ reason: f.text('reason') })
}

export function parseConfirmBody(raw: unknown): ConfirmInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const approval_id = f.uuid('approval_id')
  const route_id = f.uuid('route_id')
  const pattern_id = body.pattern_id === undefined || body.pattern_id === null ? undefined : f.uuid('pattern_id')
  const flight_number = f.code('flight_number')
  const aircraft_id = f.uuid('aircraft_id')
  let service_date = new Date(NaN)
  try {
    service_date = parseDate(f.text('service_date'), 'service_date')
  } catch {
    if (body.service_date !== undefined) f.errors.push('service_date must be YYYY-MM-DD')
  }
  const scheduled_dep_at = f.instant('scheduled_dep_at')
  const scheduled_arr_at = f.instant('scheduled_arr_at')
  if (!f.errors.length && !(scheduled_arr_at > scheduled_dep_at)) f.errors.push('scheduled_arr_at must be after scheduled_dep_at')
  return f.done({ approval_id, route_id, pattern_id, flight_number, service_date, aircraft_id, scheduled_dep_at, scheduled_arr_at })
}
