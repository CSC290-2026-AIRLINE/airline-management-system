import { invalidField } from '@backend/modules/passenger-profiles/f7-exception.filter'
import { Injectable, type PipeTransform } from '@nestjs/common'
import { triggers, type Decision, type Trigger } from '../screening.rules'

export class CheckDto {
  passengerId!: string
  flightId!: string
  pnrId?: string
  triggerPoint!: Trigger
}
export class ReviewDto {
  decision!: Decision
  note!: string
  passportCompared!: true
  expectedRevision!: number
}
export class QueueDto {
  status: 'needs-review' | 'held' | 'flagged' | 'decided' = 'needs-review'
  sort: 'departure' | 'waiting' | 'match' = 'departure'
  q = ''
  limit = 20
  cursor?: string
}

export function objectInput(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidField('request', 'Expected an object')
  if (Object.keys(value).some((key) => !fields.includes(key))) throw invalidField('request', 'Unknown request field')
  return value as Record<string, unknown>
}
export function uuid(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw invalidField(field, 'Expected a UUID')
  return value
}
function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw invalidField(field, 'Invalid option')
  return value as T
}

// Feature-local pipes are used instead of adding validation dependencies.
@Injectable()
export class CheckPipe implements PipeTransform<unknown, CheckDto> {
  transform(value: unknown): CheckDto {
    const data = objectInput(value, ['passengerId', 'flightId', 'pnrId', 'triggerPoint'])
    return {
      passengerId: uuid(data.passengerId, 'passengerId'),
      flightId: uuid(data.flightId, 'flightId'),
      ...(data.pnrId === undefined ? {} : { pnrId: uuid(data.pnrId, 'pnrId') }),
      triggerPoint: choice(data.triggerPoint, triggers, 'triggerPoint'),
    }
  }
}
@Injectable()
export class ReviewPipe implements PipeTransform<unknown, ReviewDto> {
  transform(value: unknown): ReviewDto {
    const data = objectInput(value, ['decision', 'note', 'passportCompared', 'expectedRevision'])
    if (typeof data.note !== 'string' || !data.note.trim() || data.note.trim().length > 2000)
      throw invalidField('note', 'A note of 1 to 2000 characters is required')
    if (data.passportCompared !== true) throw invalidField('passportCompared', 'Passport comparison must be acknowledged')
    if (
      !Number.isSafeInteger(data.expectedRevision) ||
      (data.expectedRevision as number) < 0 ||
      (data.expectedRevision as number) >= 2147483647
    )
      throw invalidField('expectedRevision', 'Must be a non-negative integer; use 0 for the first review')
    return {
      decision: choice(data.decision, ['confirmed', 'false_positive'], 'decision'),
      note: data.note.trim(),
      passportCompared: true,
      expectedRevision: data.expectedRevision as number,
    }
  }
}
@Injectable()
export class QueuePipe implements PipeTransform<unknown, QueueDto> {
  transform(value: unknown): QueueDto {
    const data = objectInput(value, ['status', 'sort', 'q', 'limit', 'cursor'])
    const result = new QueueDto()
    if (data.status !== undefined) result.status = choice(data.status, ['needs-review', 'held', 'flagged', 'decided'], 'status')
    if (data.sort !== undefined) result.sort = choice(data.sort, ['departure', 'waiting', 'match'], 'sort')
    if (data.q !== undefined) {
      if (typeof data.q !== 'string' || data.q.length > 100) throw invalidField('q', 'Must be at most 100 characters')
      result.q = data.q.trim()
    }
    if (data.limit !== undefined) {
      if (typeof data.limit !== 'string' || !/^\d{1,3}$/.test(data.limit) || +data.limit < 1 || +data.limit > 100)
        throw invalidField('limit', 'Must be between 1 and 100')
      result.limit = +data.limit
    }
    if (data.cursor !== undefined) {
      if (typeof data.cursor !== 'string' || data.cursor.length > 2000 || !/^[A-Za-z0-9_-]+$/.test(data.cursor))
        throw invalidField('cursor', 'Invalid cursor')
      result.cursor = data.cursor
    }
    return result
  }
}
