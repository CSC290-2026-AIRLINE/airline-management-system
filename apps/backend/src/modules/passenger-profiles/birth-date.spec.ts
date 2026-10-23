import { isValidBirthDate } from './birth-date'

const today = new Date('2026-01-01T12:30:00.000Z')

describe('DOB validation with a supplied today', () => {
  it.each(['1900-01-01', '2000-02-29', '2025-12-31', '2026-01-01'])('accepts valid DOB %s through the supplied day', (value) => {
    expect(isValidBirthDate(value, today)).toBe(true)
  })
  it.each([
    '1899-12-31',
    '2026-01-02',
    '1900-02-29',
    '2025-02-29',
    '2000-02-30',
    '2000-04-31',
    '2000-00-10',
    '2000-13-10',
    '2000-01-00',
    '2000-01-32',
    '01/01/2000',
    '2000-1-01',
    '',
    null,
    undefined,
    20000101,
  ])('rejects out-of-range, impossible or malformed DOB %p', (value) => {
    expect(isValidBirthDate(value, today)).toBe(false)
  })
  it('uses the supplied day rather than the machine clock', () => {
    expect(isValidBirthDate('2026-01-02', today)).toBe(false)
    expect(isValidBirthDate('2026-01-02', new Date('2026-01-02T00:00:00Z'))).toBe(true)
  })
  it('compares calendar days at UTC midnight and leaves today unchanged', () => {
    const midnight = new Date('2026-01-01T00:00:00Z')
    expect(isValidBirthDate('2026-01-01', midnight)).toBe(true)
    expect(isValidBirthDate('2026-01-02', new Date('2026-01-01T23:59:59.999Z'))).toBe(false)
    expect(midnight.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
  it('rejects an invalid reference day', () => {
    expect(isValidBirthDate('2000-01-01', new Date('invalid'))).toBe(false)
  })
})
