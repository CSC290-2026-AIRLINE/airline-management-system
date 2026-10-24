import { BadRequestException } from '@nestjs/common'

/**
 * Input parsing shared by the five crew rostering controllers. This feature validates inline
 * rather than with DTO classes, so these are the whole validation layer at the boundary. Each
 * helper throws a `BadRequestException` naming the field, which is what a class-validator
 * message would have done.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A required JSON object body. */
export function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new BadRequestException('Request body must be a JSON object')
  return body as Record<string, unknown>
}

/** For routes whose body is optional: a missing body is an empty object, anything else must still be one. */
export function asObjectOrEmpty(body: unknown): Record<string, unknown> {
  if (body === undefined || body === null) return {}
  return asObject(body)
}

/** A required, non-blank string. Blank is rejected rather than trimmed to empty. */
export function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new BadRequestException(`${field} is required`)
  return value.trim()
}

/** Ids reach Postgres as UUID parameters, so a malformed one is a 400 here rather than a 500 there. */
export function requireUuid(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (!UUID.test(text)) throw new BadRequestException(`${field} must be a UUID`)
  return text
}

/** A `YYYY-MM-DD` calendar date. Rejects full ISO instants, because the pages only ever send dates. */
export function requireDate(value: unknown, field: string): string {
  const text = requireText(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date`)
  }
  return text
}
