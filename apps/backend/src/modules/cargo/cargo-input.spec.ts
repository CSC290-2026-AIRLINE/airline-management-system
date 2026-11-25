import { BadRequestException } from '@nestjs/common'
import { addDays, isIsoDate, localDateStr, ParseIsoDatePipe } from './cargo-input'

describe('isIsoDate', () => {
  it.each(['2026-11-23', '2028-02-29'])('accepts %s', (v) => expect(isIsoDate(v)).toBe(true))
  it.each(['tomorrow', '2026-13-01', '2026-02-30', '2027-02-29', '2026-1-5', '2026-11-23T00:00:00Z'])('rejects %s', (v) =>
    expect(isIsoDate(v)).toBe(false),
  )
})

describe('ParseIsoDatePipe', () => {
  it('passes a valid date through', () => {
    expect(new ParseIsoDatePipe().transform('2026-11-23')).toBe('2026-11-23')
  })

  it('turns a bad or missing required date into a 400', () => {
    expect(() => new ParseIsoDatePipe().transform('tomorrow')).toThrow(BadRequestException)
    expect(() => new ParseIsoDatePipe().transform(undefined)).toThrow(BadRequestException)
  })

  it('lets a missing optional date through as undefined but still rejects a bad one', () => {
    const pipe = new ParseIsoDatePipe({ optional: true })
    expect(pipe.transform('')).toBeUndefined()
    expect(pipe.transform(undefined)).toBeUndefined()
    expect(() => pipe.transform('2026-02-30')).toThrow(BadRequestException)
  })
})

describe('ship-date window helpers', () => {
  it('takes the date in the airport timezone, not UTC', () => {
    // 20:00 UTC on 23 Nov is already 03:00 on 24 Nov in Bangkok.
    expect(localDateStr(new Date('2026-11-23T20:00:00Z'), 'Asia/Bangkok')).toBe('2026-11-24')
    expect(localDateStr(new Date('2026-11-23T20:00:00Z'), 'UTC')).toBe('2026-11-23')
  })

  it('adds calendar days across month and year ends', () => {
    expect(addDays('2026-11-24', 30)).toBe('2026-12-24')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
