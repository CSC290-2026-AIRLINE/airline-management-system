import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

/** The calendar date (YYYY-MM-DD) of `moment` in `timeZone`. A flight's service_date is its origin's local date, so date windows
 *  must be counted in that zone, not in UTC (Bangkok is already on the next day from 17:00 UTC). */
export function localDateStr(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment)
}

/** YYYY-MM-DD plus whole days, on the calendar (no clock or DST involved). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** True for a real calendar date written as YYYY-MM-DD (2026-02-30 and 2026-13-01 are false). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Validates a YYYY-MM-DD query param, so a bad date is a 400 rather than an Invalid Date reaching Prisma (a 500). With `optional`, a
 * missing or empty value passes through as undefined.
 */
@Injectable()
export class ParseIsoDatePipe implements PipeTransform<string | undefined, string | undefined> {
  constructor(private readonly opts: { optional?: boolean } = {}) {}

  transform(value: string | undefined): string | undefined {
    if (value == null || value === '') {
      if (this.opts.optional) return undefined
      throw new BadRequestException({ error: { code: 'INVALID_DATE', message: 'A date in YYYY-MM-DD format is required' } })
    }
    if (!isIsoDate(value)) {
      throw new BadRequestException({ error: { code: 'INVALID_DATE', message: `'${value}' is not a valid YYYY-MM-DD date` } })
    }
    return value
  }
}
