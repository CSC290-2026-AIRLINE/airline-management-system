import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

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
