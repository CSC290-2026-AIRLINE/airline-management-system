/** Round UP to the next 0.5 kg (e.g. 200.1 → 200.5, 200.5 → 200.5, 201.0 → 201.0). */
function ceilHalf(n: number): number {
  return Math.ceil(n * 2) / 2
}

export function chargeableKg(weightKg: number, volumeM3: number, kgPerM3 = 167): number {
  return ceilHalf(Math.max(weightKg, volumeM3 * kgPerM3))
}

export function freightCharge(chargeableKg: number, ratePerKg: number, minCharge: number): number {
  return Math.round(Math.max(chargeableKg * ratePerKg, minCharge) * 100) / 100
}

export interface AvailableKgInput {
  holdLimitKg: number
  sellableSeats: number
  seatsTaken: number
  reserveKgPerPax: number
  floorPercent: number
  committedKg: number
}

export function availableKg(input: AvailableKgInput): number {
  const { holdLimitKg, sellableSeats, seatsTaken, reserveKgPerPax, floorPercent, committedKg } = input
  const floorPax = Math.ceil((sellableSeats * floorPercent) / 100)
  const reservePax = Math.max(seatsTaken, floorPax)
  return holdLimitKg - reservePax * reserveKgPerPax - committedKg
}

export function exceedsTolerance(measuredChargeable: number, quotedChargeable: number, percent: number): boolean {
  return measuredChargeable > quotedChargeable * (1 + percent / 100)
}

export function awbNumber(prefix: string, serial: number): string {
  const check = serial % 7
  return `${prefix}-${String(serial).padStart(7, '0')}-${check}`
}
