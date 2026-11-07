export type BagRefusal = 'overweight' | 'oversize'

export interface BagMeasurements {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export function roundKg(weightKg: number): number {
  return Math.round(weightKg * 10) / 10
}

/** Each bag keeps the excess it added, bags weighed in order against the shared allowance. */
export function allocateExcess(weightsKg: number[], freeKg: number): number[] {
  let remaining = freeKg
  return weightsKg.map((weightKg) => {
    const kg = roundKg(weightKg)
    const excess = Math.max(0, kg - remaining)
    remaining = Math.max(0, remaining - kg)
    return roundKg(excess)
  })
}

export function excessFee(excessKg: number, ratePerKg: number): number {
  return Math.round(excessKg * ratePerKg * 100) / 100
}

export function checkedBagRefusal(bag: BagMeasurements, limits: { maxBagKg: number; maxLinearCm: number }): BagRefusal | null {
  if (roundKg(bag.weightKg) > limits.maxBagKg) return 'overweight'
  if (bag.lengthCm + bag.widthCm + bag.heightCm > limits.maxLinearCm) return 'oversize'
  return null
}

/** Dimensions may be measured in any orientation, so both sides are compared largest first. */
export function carryOnResult(
  bag: BagMeasurements,
  allowance: { maxKg: number; maxLengthCm: number; maxWidthCm: number; maxHeightCm: number },
): { withinSize: boolean; withinWeight: boolean; result: 'ok' | 'must_check' } {
  const dims = [bag.lengthCm, bag.widthCm, bag.heightCm].sort((a, b) => b - a)
  const limits = [allowance.maxLengthCm, allowance.maxWidthCm, allowance.maxHeightCm].sort((a, b) => b - a)
  const withinSize = dims.every((dim, i) => dim <= limits[i])
  const withinWeight = roundKg(bag.weightKg) <= allowance.maxKg
  return { withinSize, withinWeight, result: withinSize && withinWeight ? 'ok' : 'must_check' }
}

/** 10 digits: 0 + 3-digit airline number + 6-digit sequence. */
export function bagTagNumber(airlineNumber: string, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1 || seq > 999999) {
    throw new RangeError(`Bag tag sequence out of range: ${seq}`)
  }
  return `0${airlineNumber}${String(seq).padStart(6, '0')}`
}
