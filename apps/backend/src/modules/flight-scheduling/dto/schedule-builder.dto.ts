import { BadRequestException } from '@nestjs/common'
import { parseDate, UUID } from '../pagination'

// Both dates are optional and default to the timetable's own validity period.
export interface PreviewScheduleInput {
  timetable_id: string
  from?: Date
  to?: Date
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

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
