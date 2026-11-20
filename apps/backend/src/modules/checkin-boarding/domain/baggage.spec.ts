import { allocateExcess, bagTagNumber, carryOnResult, checkedBagRefusal, excessFee, roundKg } from './baggage'

const L = { maxBagKg: 32, maxLinearCm: 158 }
const CO = { maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 }

describe('allocateExcess', () => {
  it('first bags use up the allowance; each keeps the excess it added', () => {
    expect(allocateExcess([15, 8, 10], 20)).toEqual([0, 3, 10])
  })

  it('allocateExcess rounds weights to 0.1', () => {
    expect(allocateExcess([20.04, 5.26], 20)).toEqual([0, 5.3])
  })
})

describe('roundKg', () => {
  it('rounds a weight to 0.1 kg', () => {
    expect(roundKg(23.45)).toBe(23.5)
    expect(roundKg(5.24)).toBe(5.2)
  })
})

describe('excessFee', () => {
  it('fee is excess × rate to 2 dp', () => {
    expect(excessFee(3, 500)).toBe(1500)
    expect(excessFee(0.3, 333.33)).toBe(100)
  })
})

describe('checkedBagRefusal', () => {
  it('refuses over max weight or over 158 linear cm', () => {
    expect(checkedBagRefusal({ weightKg: 32.1, lengthCm: 50, widthCm: 40, heightCm: 30 }, L)).toBe('overweight')
    expect(checkedBagRefusal({ weightKg: 20, lengthCm: 80, widthCm: 50, heightCm: 30 }, L)).toBe('oversize')
    expect(checkedBagRefusal({ weightKg: 32, lengthCm: 78, widthCm: 50, heightCm: 30 }, L)).toBeNull()
  })
})

describe('carryOnResult', () => {
  it('carry-on 7 kg and 56×36×23 in any orientation', () => {
    expect(carryOnResult({ weightKg: 7, lengthCm: 23, widthCm: 56, heightCm: 36 }, CO)).toEqual({
      withinSize: true,
      withinWeight: true,
      result: 'ok',
    })
    expect(carryOnResult({ weightKg: 7.1, lengthCm: 56, widthCm: 36, heightCm: 23 }, CO).result).toBe('must_check')
    expect(carryOnResult({ weightKg: 5, lengthCm: 57, widthCm: 36, heightCm: 23 }, CO)).toMatchObject({
      withinSize: false,
      result: 'must_check',
    })
  })
})

describe('bagTagNumber', () => {
  it('bag tag is 0 + airline number + 6-digit sequence', () => {
    expect(bagTagNumber('402', 1)).toBe('0402000001')
    expect(bagTagNumber('402', 999999)).toBe('0402999999')
    expect(() => bagTagNumber('402', 1000000)).toThrow(RangeError)
  })
})
