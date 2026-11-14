import { nameKey, normalizePassportName, normalizePassportNumber } from './identity-normalization'

describe('Identity normalization', () => {
  it.each([
    [' José ', 'Jose'],
    ['Muñoz', 'Munoz'],
    ['Łukasz', 'Lukasz'],
    ['Søren', 'Soren'],
    ['Groß', 'Gross'],
    ['D’Angelo', "D'Angelo"],
    ['  Mary   Jane ', 'Mary Jane'],
  ])('normalizes %s to ASCII passport spelling', (input, output) => {
    expect(normalizePassportName(input)).toBe(output)
  })
  it('does not silently erase Thai characters or invent a Latin passport name', () => {
    expect(normalizePassportName('สมชาย')).toBe('สมชาย')
  })
  it('keeps non-string input available for DTO rejection', () => {
    expect(normalizePassportName(42)).toBe(42)
    expect(normalizePassportNumber(42)).toBe(42)
  })
  it('uses the same letters-and-digits key as SQL name_key, including digits', () => {
    expect(nameKey('Mary-Jane', "O'Neil 2")).toBe('MARYJANEONEIL2')
    expect(nameKey('Mary Jane', 'ONeil2')).toBe('MARYJANEONEIL2')
  })
  it('normalizes passport numbers and supports explicit clearing', () => {
    expect(normalizePassportNumber('ab 12-34')).toBe('AB1234')
    expect(normalizePassportNumber('   ')).toBeNull()
    expect(normalizePassportNumber(null)).toBeNull()
  })
})
