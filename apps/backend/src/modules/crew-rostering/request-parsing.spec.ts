import { BadRequestException } from '@nestjs/common'
import { asObject, asObjectOrEmpty, requireDate, requireText, requireUuid } from './request-parsing'

const ID = '0f4b6a52-6d1c-4f0e-9a52-0d3d6a9b7c11'

describe('request parsing', () => {
  it('requires a JSON object body, except where a body is optional', () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 })
    for (const bad of [undefined, null, [], 'text', 3]) expect(() => asObject(bad)).toThrow(BadRequestException)

    expect(asObjectOrEmpty(undefined)).toEqual({})
    expect(asObjectOrEmpty(null)).toEqual({})
    expect(asObjectOrEmpty({ a: 1 })).toEqual({ a: 1 })
    expect(() => asObjectOrEmpty([])).toThrow('Request body must be a JSON object')
  })

  it('trims text and rejects blank or non-string values, naming the field', () => {
    expect(requireText('  hello ', 'name')).toBe('hello')
    for (const bad of ['', '   ', undefined, 5]) expect(() => requireText(bad, 'name')).toThrow('name is required')
  })

  it('accepts only UUIDs for ids', () => {
    expect(requireUuid(` ${ID} `, 'id')).toBe(ID)
    expect(() => requireUuid('abc', 'id')).toThrow('id must be a UUID')
    expect(() => requireUuid('', 'id')).toThrow('id is required')
  })

  it('accepts only real YYYY-MM-DD dates, not instants', () => {
    expect(requireDate('2026-09-17', 'dateFrom')).toBe('2026-09-17')
    for (const bad of ['2026-9-17', '2026-09-17T00:00:00Z', '2026-13-40', 'tomorrow']) {
      expect(() => requireDate(bad, 'dateFrom')).toThrow('dateFrom must be a YYYY-MM-DD date')
    }
  })
})
