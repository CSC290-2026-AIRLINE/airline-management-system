/**
 * Crew pay arithmetic (5c, stretch), kept pure so it is tested without a database. Every number that is stored is in
 * hundredths (quantity in hundredths of an hour or overnight, rate in cents, multiplier in hundredths), so the amount
 * equals what the payroll_line CHECK recomputes: round(quantity x rate x multiplier, 2), half up.
 */

export interface Leg {
  depAt: Date
  arrAt: Date
}

export interface PairingPayInput {
  /** The legs this crew member actually worked (active assignments only). */
  legs: Leg[]
  /** IANA zone of the pairing's base, for the local duty dates. */
  timeZone: string
  reportMinutes: number
  releaseMinutes: number
  /** Hours of duty per day above which overtime starts. */
  overtimeThresholdHours: number
}

export interface PairingPayQuantities {
  /** Hundredths of an hour. */
  flightHundredths: number
  overtimeHundredths: number
  /** Whole overnights, as hundredths so every quantity has the same unit. */
  overnightHundredths: number
  dutyDays: number
  /** The local date the pairing ended (YYYY-MM-DD): payroll_line.earned_on. */
  earnedOn: string
}

/** Minutes to hundredths of an hour, half up. */
export function minutesToHundredths(minutes: number): number {
  return Math.floor((minutes * 100 + 30) / 60)
}

export function localDate(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment)
}

/**
 * Flight hours, overtime and overnights for one crew member on one pairing. A duty day is the legs that depart on the
 * same local date; its duty runs from report time (first departure minus reportMinutes) to release time (last arrival
 * plus releaseMinutes). Overtime is the duty above the threshold, summed over the duty days.
 */
export function pairingQuantities(input: PairingPayInput): PairingPayQuantities {
  const legs = [...input.legs].sort((a, b) => a.depAt.getTime() - b.depAt.getTime())
  if (legs.length === 0) throw new Error('A pairing needs at least one leg to be priced')

  const flightMinutes = legs.reduce((sum, leg) => sum + Math.max(0, (leg.arrAt.getTime() - leg.depAt.getTime()) / 60_000), 0)

  const days = new Map<string, Leg[]>()
  for (const leg of legs) {
    const day = localDate(leg.depAt, input.timeZone)
    days.set(day, [...(days.get(day) ?? []), leg])
  }
  const thresholdMinutes = input.overtimeThresholdHours * 60
  let overtimeMinutes = 0
  for (const dayLegs of days.values()) {
    const start = dayLegs[0].depAt.getTime() - input.reportMinutes * 60_000
    const end = Math.max(...dayLegs.map((l) => l.arrAt.getTime())) + input.releaseMinutes * 60_000
    overtimeMinutes += Math.max(0, (end - start) / 60_000 - thresholdMinutes)
  }

  const last = legs.reduce((a, b) => (b.arrAt > a.arrAt ? b : a))
  return {
    flightHundredths: minutesToHundredths(Math.round(flightMinutes)),
    overtimeHundredths: minutesToHundredths(Math.round(overtimeMinutes)),
    overnightHundredths: Math.max(0, days.size - 1) * 100,
    dutyDays: days.size,
    earnedOn: localDate(last.arrAt, input.timeZone),
  }
}

/** round(quantity x rate x multiplier, 2), half up, in cents. BigInt so large inputs never lose precision. */
export function lineAmountCents(quantityHundredths: number, rateCents: number, multiplierHundredths: number): number {
  const product = BigInt(quantityHundredths) * BigInt(rateCents) * BigInt(multiplierHundredths)
  const sign = product < 0n ? -1n : 1n
  const abs = product * sign
  // The product is in 1e-6 dollars, i.e. 1e-4 cents: divide by 10 000, rounding half away from zero like Postgres.
  return Number(((abs + 5000n) / 10000n) * sign)
}

/** "1.5" -> 150, for multipliers stored as NUMERIC(3,2). */
export function toHundredths(value: number): number {
  return Math.round(value * 100)
}

export function hundredthsToDecimal(value: number): string {
  const abs = Math.abs(value)
  return `${value < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * What one crew member gets paid in a run: the sum of their lines. A non-positive net is not paid; its lines go back
 * to accrued and carry into the next run.
 */
export function netByCrew(lines: { crewId: string; amountCents: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of lines) out.set(line.crewId, (out.get(line.crewId) ?? 0) + line.amountCents)
  return out
}
