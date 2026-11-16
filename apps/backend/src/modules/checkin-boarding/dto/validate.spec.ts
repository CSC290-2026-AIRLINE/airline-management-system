import { CheckInError } from '../errors'
import { requireBoolean, requireStringArray } from './validate'

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    if (e instanceof CheckInError) return e.code
    throw e
  }
  throw new Error('expected a CheckInError')
}

describe('requireStringArray', () => {
  it('keeps a list of texts', () => {
    expect(requireStringArray({ codes: ['D1', 'D2'] }, 'codes', { max: 30 })).toEqual(['D1', 'D2'])
  })

  it('refuses a value that is not a list', () => {
    expect(codeOf(() => requireStringArray({ codes: 'D1' }, 'codes', { max: 30 }))).toBe('VALIDATION')
  })

  it('refuses an empty list', () => {
    expect(codeOf(() => requireStringArray({ codes: [] }, 'codes', { max: 30 }))).toBe('VALIDATION')
  })

  it('refuses more items than the maximum', () => {
    const codes = Array.from({ length: 31 }, (_, i) => `D${i}`)
    expect(codeOf(() => requireStringArray({ codes }, 'codes', { max: 30 }))).toBe('VALIDATION')
  })

  it('refuses an item that is not a text', () => {
    expect(codeOf(() => requireStringArray({ codes: ['D1', 7] }, 'codes', { max: 30 }))).toBe('VALIDATION')
  })
})

describe('requireBoolean', () => {
  it('keeps a flag', () => {
    expect(requireBoolean({ isActive: false }, 'isActive')).toBe(false)
  })

  it('refuses the text "true"', () => {
    expect(codeOf(() => requireBoolean({ isActive: 'true' }, 'isActive'))).toBe('VALIDATION')
  })

  it('refuses a missing flag', () => {
    expect(codeOf(() => requireBoolean({}, 'isActive'))).toBe('VALIDATION')
  })
})
