import { BadRequestException } from '@nestjs/common'
import { validateBirthDate } from './birth-date'

describe('validateBirthDate', () => {
  const today = new Date('2026-10-27T00:01:00Z')
  it.each([undefined, null, '', '2026-10-27', '2000-02-29'])('accepts an optional or non-future DOB: %s', (value) => {
    expect(() => validateBirthDate(value, today)).not.toThrow()
  })
  it.each(['2026-10-28', '2025-02-29', '2026-02-30', '27/10/2026', 'invalid'])('rejects an invalid or future DOB: %s', (value) => {
    expect(() => validateBirthDate(value, today)).toThrow(BadRequestException)
  })
  it('uses the supplied business date rather than the machine clock', () => {
    expect(() => validateBirthDate('2030-01-02', new Date('2030-01-01T23:59:59Z'))).toThrow(BadRequestException)
    expect(() => validateBirthDate('2030-01-02', new Date('2030-01-02T00:00:00Z'))).not.toThrow()
  })
})
