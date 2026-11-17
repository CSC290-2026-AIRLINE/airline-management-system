import { withValue } from './with-value'

describe('withValue', () => {
  it('sets the field named in the path, replacing one in the body', () => {
    expect(withValue({ amount: 5, airport: 'ZZZ' }, 'airport', 'BKK')).toEqual({ amount: 5, airport: 'BKK' })
  })

  it('passes a body that is not an object on unchanged', () => {
    expect(withValue('text', 'airport', 'BKK')).toBe('text')
    expect(withValue(null, 'airport', 'BKK')).toBeNull()
    expect(withValue([1], 'airport', 'BKK')).toEqual([1])
  })
})
