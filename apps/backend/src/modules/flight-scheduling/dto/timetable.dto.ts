import { BadRequestException } from '@nestjs/common'
import { parseDate, UUID } from '../pagination'

export interface ListTimetablesQueryDto {
  route_id?: string
  flight_number?: string
  valid_on?: string // YYYY-MM-DD; timetables whose validity period covers this day
  cursor?: string // id of the last timetable on the previous page
  limit?: string
}

export interface TimetableInput {
  route_id: string
  flight_number: string
  dep_time_local: Date // TIME column; only the clock part (on 1970-01-01) is meaningful
  days_of_week: number[] // 1 = Monday ... 7 = Sunday, origin local time
  valid_from: Date
  valid_to: Date
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseTimetableBody(body: unknown): TimetableInput {
  if (!isObject(body)) throw new BadRequestException('body must be a JSON object')
  const errors: string[] = []

  const attempt = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch (e) {
      errors.push((e as Error).message)
      return fallback
    }
  }

  const route_id = typeof body.route_id === 'string' && UUID.test(body.route_id) ? body.route_id : ''
  if (!route_id) errors.push('route_id must be a UUID')

  const flight_number = typeof body.flight_number === 'string' ? body.flight_number.trim().toUpperCase() : ''
  if (!flight_number) errors.push('flight_number is required')

  const time = body.dep_time_local
  if (typeof time !== 'string' || !TIME.test(time)) errors.push('dep_time_local must be HH:MM (24-hour, origin local time)')

  const days = body.days_of_week
  const validDays = Array.isArray(days) && days.length > 0 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)
  if (!validDays) errors.push('days_of_week must be a non-empty array of integers 1 (Monday) to 7 (Sunday)')

  const epoch = new Date(0)
  const valid_from = attempt(() => parseDate(String(body.valid_from), 'valid_from'), epoch)
  const valid_to = attempt(() => parseDate(String(body.valid_to), 'valid_to'), epoch)
  if (valid_to < valid_from) errors.push('valid_to must not be before valid_from')

  if (errors.length) throw new BadRequestException(errors)
  return {
    route_id,
    flight_number,
    dep_time_local: new Date(`1970-01-01T${time as string}:00Z`),
    days_of_week: [...new Set(days as number[])].sort((a, b) => a - b),
    valid_from,
    valid_to,
  }
}
