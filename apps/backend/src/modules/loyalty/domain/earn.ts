import { EarnRule } from './types'

// Miles for one flown coupon: round(distance_km * multiplier), the same expression as the ledger's CHECK.
// The multiplier is NUMERIC(4, 2), so it is read as whole hundredths and the sum stays in integers: 30 km at 1.15 is
// 34.5 and must round to 35 as PostgreSQL does, while 30 * 1.15 in floating point is 34.4999... and would give 34.
export function earnMiles(distanceKm: number, multiplier: string): number {
  if (!Number.isInteger(distanceKm) || distanceKm <= 0) throw new RangeError('distanceKm must be a positive integer')
  const hundredths = multiplierHundredths(multiplier)
  return Math.floor((distanceKm * hundredths + 50) / 100)
}

export function multiplierHundredths(multiplier: string): number {
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(multiplier.trim())
  if (!match) throw new RangeError(`multiplier must be NUMERIC(4, 2) and not negative, got "${multiplier}"`)
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

export interface EarnCandidate {
  bookingCouponId: string
  fareClassId: string | null // null for an award seat, which has no fare class
  distanceKm: number
  isLapInfant: boolean
  boarded: boolean // feature 6's check_in
  flightCancelled: boolean
  arrAt: Date // planned arrival; the earn job runs once it has passed on the simulation clock
}

export interface EarnRowDraft {
  bookingCouponId: string
  miles: number
  distanceKm: number
  fareClassId: string
  multiplier: string
  occurredAt: Date
}

export type EarnSkipReason = 'not_arrived' | 'cancelled' | 'not_boarded' | 'lap_infant' | 'award_seat' | 'before_joined' | 'no_miles'

// Decides whether one coupon earns and builds its ledger row. A skipped coupon is not an error: the job moves on.
// Repeats are safe in the database through UNIQUE (booking_coupon_id, type), so the job may see a coupon twice.
export function draftEarn(
  candidate: EarnCandidate,
  rules: ReadonlyMap<string, EarnRule>,
  memberJoinedAt: Date,
  now: Date,
): { draft: EarnRowDraft } | { skip: EarnSkipReason } {
  if (candidate.arrAt > now) return { skip: 'not_arrived' }
  if (candidate.flightCancelled) return { skip: 'cancelled' }
  if (!candidate.boarded) return { skip: 'not_boarded' }
  if (candidate.isLapInfant) return { skip: 'lap_infant' }
  if (candidate.fareClassId === null) return { skip: 'award_seat' }
  if (candidate.arrAt < memberJoinedAt) return { skip: 'before_joined' }

  const rule = rules.get(candidate.fareClassId)
  if (!rule) return { skip: 'no_miles' }
  const miles = earnMiles(candidate.distanceKm, rule.multiplier)
  if (miles === 0) return { skip: 'no_miles' }

  return {
    draft: {
      bookingCouponId: candidate.bookingCouponId,
      miles,
      distanceKm: candidate.distanceKm,
      fareClassId: candidate.fareClassId,
      multiplier: rule.multiplier,
      occurredAt: candidate.arrAt,
    },
  }
}
