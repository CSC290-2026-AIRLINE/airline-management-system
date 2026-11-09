// Complimentary upgrade rules (F11 doc, Tier benefits). Pure, so the order and the seat count are tested without a database.

export const CABIN_ORDER = ['economy', 'premium_economy', 'business', 'first'] as const
export type Cabin = (typeof CABIN_ORDER)[number]

/** The upgrade job looks this far ahead of departure on the simulation clock. */
export const UPGRADE_WINDOW_HOURS = 24

export const isCabin = (value: string): value is Cabin => (CABIN_ORDER as readonly string[]).includes(value)

/** The next cabin up that the flight has, or null when `from` is already its best cabin. One step only. */
export function nextCabin(from: string, cabinsOnFlight: readonly string[]): Cabin | null {
  const start = CABIN_ORDER.indexOf(from as Cabin)
  if (start < 0) return null
  return CABIN_ORDER.slice(start + 1).find((c) => cabinsOnFlight.includes(c)) ?? null
}

export interface CabinSeats {
  capacity: number
  heldCount: number
  soldCount: number
  awardLimit: number
  awardHeldCount: number
  awardSoldCount: number
}

/**
 * Seats nobody holds or bought, less the award seats still set aside for miles: an upgrade never takes a seat that is
 * sold, held, or waiting for a member to redeem it. Award holds and sales are already inside held_count and sold_count.
 */
export function freeCashSeats(s: CabinSeats): number {
  const awardOpen = Math.max(0, s.awardLimit - s.awardHeldCount - s.awardSoldCount)
  return Math.max(0, s.capacity - s.heldCount - s.soldCount - awardOpen)
}

export interface UpgradeCandidate {
  couponId: string
  flightId: string
  fromCabin: string
  tierRank: number
  confirmedAt: Date
}

/** Higher tier first, then the booking confirmed earliest; the coupon id breaks a tie so the order never changes. */
export function upgradeOrder(a: UpgradeCandidate, b: UpgradeCandidate): number {
  return b.tierRank - a.tierRank || a.confirmedAt.getTime() - b.confirmedAt.getTime() || a.couponId.localeCompare(b.couponId)
}

/** Groups the candidates per flight and cabin, each group in upgrade order. */
export function upgradeQueues(candidates: readonly UpgradeCandidate[]): Map<string, UpgradeCandidate[]> {
  const queues = new Map<string, UpgradeCandidate[]>()
  for (const c of [...candidates].sort(upgradeOrder)) {
    const key = `${c.flightId}:${c.fromCabin}`
    const list = queues.get(key) ?? []
    list.push(c)
    queues.set(key, list)
  }
  return queues
}
