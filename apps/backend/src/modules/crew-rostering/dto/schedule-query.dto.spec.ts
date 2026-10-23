import { BadRequestException } from '@nestjs/common'
import { parseScheduleQuery } from './schedule-query.dto'

describe('parseScheduleQuery', () => {
  it('accepts a well-formed window', () => {
    expect(parseScheduleQuery({ dateFrom: '2026-09-15', dateTo: '2026-09-17', base: 'BKK' })).toEqual({
      dateFrom: '2026-09-15',
      dateTo: '2026-09-17',
      base: 'BKK',
    })
  })

  it('allows a single-day window', () => {
    const parsed = parseScheduleQuery({ dateFrom: '2026-09-15', dateTo: '2026-09-15', base: 'BKK' })

    expect(parsed.dateFrom).toBe(parsed.dateTo)
  })

  it.each([
    ['a missing field', { dateFrom: '2026-09-15', dateTo: '2026-09-17' }, 'base is required'],
    ['a non-ISO date', { dateFrom: '15/09/2026', dateTo: '2026-09-17', base: 'BKK' }, 'dateFrom must be a YYYY-MM-DD date'],
    ['an impossible date', { dateFrom: '2026-02-30', dateTo: '2026-09-17', base: 'BKK' }, 'dateFrom is not a real calendar date'],
    ['an inverted window', { dateFrom: '2026-09-17', dateTo: '2026-09-15', base: 'BKK' }, 'dateTo must be on or after dateFrom'],
    ['a non-IATA base', { dateFrom: '2026-09-15', dateTo: '2026-09-17', base: 'bkk' }, 'base must be a three-letter IATA airport code'],
  ])('rejects %s', (_case, raw, message) => {
    expect(() => parseScheduleQuery(raw)).toThrow(new BadRequestException(message))
  })
})
