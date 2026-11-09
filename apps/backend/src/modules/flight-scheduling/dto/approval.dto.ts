import { BadRequestException } from '@nestjs/common'
import { parseDate } from '../pagination'
import { asBody, Fields } from './operations.dto'

// Request body for PUT /airports/:iata/approval-policy. Times are local clock times at the airport.

export type OfferStyle = 'window' | 'slots'

export interface ApprovalPolicyInput {
  curfew_start_local: string | null
  curfew_end_local: string | null
  max_departure_per_hour: number | null
  offer_style: OfferStyle
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function parsePolicyBody(raw: unknown): ApprovalPolicyInput {
  const body = asBody(raw)
  const errors: string[] = []

  const time = (key: string): string | null => {
    const v = body[key]
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string' || !HHMM.test(v)) errors.push(`${key} must be HH:MM or null`)
    return typeof v === 'string' ? v : null
  }
  const curfew_start_local = time('curfew_start_local')
  const curfew_end_local = time('curfew_end_local')
  if ((curfew_start_local === null) !== (curfew_end_local === null)) errors.push('send both curfew times or neither')
  if (curfew_start_local !== null && curfew_start_local === curfew_end_local)
    errors.push('curfew_start_local and curfew_end_local must differ')

  const cap = body.max_departure_per_hour ?? null
  if (cap !== null && (typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1)) {
    errors.push('max_departure_per_hour must be a positive whole number or null')
  }

  const offer_style = body.offer_style ?? 'slots'
  if (offer_style !== 'window' && offer_style !== 'slots') errors.push('offer_style must be window or slots')

  if (errors.length) throw new BadRequestException(errors)
  return { curfew_start_local, curfew_end_local, max_departure_per_hour: cap as number | null, offer_style: offer_style as OfferStyle }
}

// Bodies for the approval requests: create, respond (the approver's answer) and revise.

export interface ApprovalRequestInput {
  purpose: 'new_flight' | 'reschedule'
  flight_id?: string
  pattern_id?: string
  route_id: string
  flight_number: string
  service_date: Date
  aircraft_id: string
  dep_at: Date
  arr_at: Date
}

export const REJECT_REASONS = ['curfew', 'no_slot_available', 'capacity_full', 'other'] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export type RespondInput =
  | { answer: 'approve'; note?: string }
  | { answer: 'reject'; reject_reason: RejectReason; note?: string }
  | { answer: 'offer'; offers: { starts_at: Date; ends_at?: Date }[]; note?: string }

export interface ReviseInput {
  dep_at: Date
  arr_at: Date
  aircraft_id?: string
}

export function parseApprovalRequestBody(raw: unknown): ApprovalRequestInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const purpose = body.purpose
  if (purpose !== 'new_flight' && purpose !== 'reschedule') f.errors.push('purpose must be new_flight or reschedule')
  const optionalUuid = (key: string) => (body[key] === undefined || body[key] === null ? undefined : f.uuid(key))
  const flight_id = optionalUuid('flight_id')
  if (purpose === 'reschedule' && !flight_id) f.errors.push('flight_id is required for a reschedule')
  if (purpose === 'new_flight' && flight_id) f.errors.push('flight_id is only for a reschedule')
  const pattern_id = optionalUuid('pattern_id')
  const route_id = f.uuid('route_id')
  const flight_number = f.code('flight_number')
  const aircraft_id = f.uuid('aircraft_id')
  let service_date = new Date(NaN)
  try {
    service_date = parseDate(f.text('service_date'), 'service_date')
  } catch {
    if (body.service_date !== undefined) f.errors.push('service_date must be YYYY-MM-DD')
  }
  const dep_at = f.instant('dep_at')
  const arr_at = f.instant('arr_at')
  if (!f.errors.length && !(arr_at > dep_at)) f.errors.push('arr_at must be after dep_at')
  return f.done({
    purpose: purpose as ApprovalRequestInput['purpose'],
    flight_id,
    pattern_id,
    route_id,
    flight_number,
    service_date,
    aircraft_id,
    dep_at,
    arr_at,
  })
}

export function parseRespondBody(raw: unknown): RespondInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const note = f.optionalText('note')
  switch (body.answer) {
    case 'approve':
      return f.done({ answer: 'approve', note })
    case 'reject': {
      const reject_reason = body.reject_reason
      if (!(REJECT_REASONS as readonly unknown[]).includes(reject_reason))
        f.errors.push(`reject_reason must be one of ${REJECT_REASONS.join(', ')}`)
      return f.done({ answer: 'reject', reject_reason: reject_reason as RejectReason, note })
    }
    case 'offer': {
      const list = Array.isArray(body.offers) ? (body.offers as unknown[]) : []
      if (list.length === 0) f.errors.push('offers must list at least one time')
      const offers = list.map((item, i) => {
        const o = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>
        const starts_at = new Fields({ starts_at: o.starts_at })
        const ends_at = new Fields({ ends_at: o.ends_at })
        const start = starts_at.instant('starts_at')
        const end = o.ends_at === undefined || o.ends_at === null ? undefined : ends_at.instant('ends_at')
        f.errors.push(...starts_at.errors.map((e) => `offers[${i}].${e}`), ...ends_at.errors.map((e) => `offers[${i}].${e}`))
        if (end && !(end > start)) f.errors.push(`offers[${i}].ends_at must be after starts_at`)
        return { starts_at: start, ...(end && { ends_at: end }) }
      })
      if (new Set(offers.map((o) => o.starts_at.getTime())).size !== offers.length) f.errors.push('offers must have different starts_at')
      return f.done({ answer: 'offer', offers, note })
    }
    default:
      throw new BadRequestException(['answer must be approve, reject or offer'])
  }
}

export function parseReviseBody(raw: unknown): ReviseInput {
  const body = asBody(raw)
  const f = new Fields(body)
  const dep_at = f.instant('dep_at')
  const arr_at = f.instant('arr_at')
  const aircraft_id = body.aircraft_id === undefined || body.aircraft_id === null ? undefined : f.uuid('aircraft_id')
  if (!f.errors.length && !(arr_at > dep_at)) f.errors.push('arr_at must be after dep_at')
  return f.done({ dep_at, arr_at, aircraft_id })
}
