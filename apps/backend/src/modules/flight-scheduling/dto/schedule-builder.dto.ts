import { BadRequestException } from '@nestjs/common'
import { parseDate, UUID } from '../pagination'

// Both dates are optional and default to the timetable's own validity period.
export interface PreviewScheduleInput {
  timetable_id: string
  from?: Date
  to?: Date
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// A one-off flight has no timetable: a route, a flight number and one departure instant.
export interface OneOffFlightInput {
  route_id: string
  flight_number: string
  dep_at: Date
}

export function parseOneOffBody(body: unknown): OneOffFlightInput {
  if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
  const errors: string[] = []
  if (typeof body.route_id !== 'string' || !UUID.test(body.route_id)) errors.push('route_id must be a UUID')
  if (typeof body.flight_number !== 'string' || !/^[A-Za-z0-9]{2}\d{1,4}$/.test(body.flight_number.trim())) {
    errors.push('flight_number must be a 2-character airline code followed by 1 to 4 digits')
  }
  const dep = typeof body.dep_at === 'string' ? new Date(body.dep_at) : new Date(NaN)
  if (Number.isNaN(dep.getTime())) errors.push('dep_at must be an ISO date-time')
  if (errors.length) throw new BadRequestException(errors)
  return { route_id: body.route_id as string, flight_number: (body.flight_number as string).trim().toUpperCase(), dep_at: dep }
}

export function parsePreviewBody(body: unknown): PreviewScheduleInput {
  if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
  const errors: string[] = []

  if (typeof body.timetable_id !== 'string' || !UUID.test(body.timetable_id)) errors.push('timetable_id must be a UUID')
  const date = (key: 'from' | 'to') => {
    const raw = body[key]
    if (raw === undefined) return undefined
    try {
      return parseDate(typeof raw === 'string' ? raw : '', key)
    } catch (e) {
      errors.push((e as Error).message)
    }
  }
  const from = date('from')
  const to = date('to')
  if (from && to && to < from) errors.push('to must not be before from')

  if (errors.length) throw new BadRequestException(errors)
  return { timetable_id: body.timetable_id as string, from, to }
}
