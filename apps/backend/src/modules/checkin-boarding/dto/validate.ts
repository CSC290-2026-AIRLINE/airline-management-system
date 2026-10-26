import { validation } from '../errors'

type Body = Record<string, unknown>

function bodyOf(body: unknown): Body {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw validation('The request body must be an object', { field: 'body' })
  }
  return body as Body
}

/** A required text: present, not blank and not longer than the field allows. */
export function requireString(body: unknown, key: string, opts?: { max?: number }): string {
  const value = bodyOf(body)[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validation(`${key} is required`, { field: key })
  }
  const trimmed = value.trim()
  if (opts?.max !== undefined && trimmed.length > opts.max) {
    throw validation(`${key} is too long`, { field: key })
  }
  return trimmed
}

/** An optional text: absent or blank means absent. */
export function optionalString(body: unknown, key: string, opts?: { max?: number }): string | undefined {
  const value = bodyOf(body)[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw validation(`${key} must be a text`, { field: key })
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  if (opts?.max !== undefined && trimmed.length > opts.max) {
    throw validation(`${key} is too long`, { field: key })
  }
  return trimmed
}

/** A required number, for the weights and the counts. */
export function requireNumber(body: unknown, key: string, opts?: { min?: number; max?: number }): number {
  const value = bodyOf(body)[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw validation(`${key} must be a number`, { field: key })
  }
  if (opts?.min !== undefined && value < opts.min) {
    throw validation(`${key} must be at least ${opts.min}`, { field: key })
  }
  if (opts?.max !== undefined && value > opts.max) {
    throw validation(`${key} must be at most ${opts.max}`, { field: key })
  }
  return value
}

/** A required whole number, for the bag count and the manual head-count. */
export function requireInt(body: unknown, key: string, opts?: { min?: number; max?: number }): number {
  const value = requireNumber(body, key, opts)
  if (!Number.isInteger(value)) throw validation(`${key} must be a whole number`, { field: key })
  return value
}

/** An optional flag, for the head-count confirmation. */
export function optionalBoolean(body: unknown, key: string): boolean {
  const value = bodyOf(body)[key]
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') throw validation(`${key} must be true or false`, { field: key })
  return value
}
