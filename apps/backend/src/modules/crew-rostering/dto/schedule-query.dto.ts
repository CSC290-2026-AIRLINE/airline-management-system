import { BadRequestException } from '@nestjs/common'

/** The window a roster run covers, and the base it is built from. */
export interface ScheduleQuery {
  /** `YYYY-MM-DD`, inclusive. */
  dateFrom: string
  /** `YYYY-MM-DD`, inclusive, and never earlier than `dateFrom`. */
  dateTo: string
  /** IATA code of the base airport, e.g. `BKK`. */
  base: string
}

/** Raw shape as it arrives from the query string, before validation. */
export type ScheduleQueryInput = Record<string, unknown>

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const IATA_PATTERN = /^[A-Z]{3}$/

/**
 * Validates the raw query string into a `ScheduleQuery`.
 *
 * Hand-rolled because the backend has no `class-validator` and no global
 * `ValidationPipe` installed — decorators on a DTO class would be inert here, so
 * the checks live in code the controller actually runs.
 */
export function parseScheduleQuery(raw: ScheduleQueryInput): ScheduleQuery {
  const dateFrom = readDate(raw, 'dateFrom')
  const dateTo = readDate(raw, 'dateTo')
  const base = readString(raw, 'base')

  if (!IATA_PATTERN.test(base)) {
    throw new BadRequestException('base must be a three-letter IATA airport code')
  }

  if (dateTo < dateFrom) {
    throw new BadRequestException('dateTo must be on or after dateFrom')
  }

  return { dateFrom, dateTo, base }
}

function readDate(raw: ScheduleQueryInput, field: string): string {
  const value = readString(raw, field)
  if (!DATE_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be a YYYY-MM-DD date`)
  }
  // The pattern accepts 2026-02-30, so round-trip to catch the impossible ones.
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} is not a real calendar date`)
  }
  return value
}

function readString(raw: ScheduleQueryInput, field: string): string {
  const value = raw[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`)
  }
  return value.trim()
}
