import { addHours } from './dates'
import { LedgerRow } from './types'

export interface AwardSeats {
  awardLimit: number // feature 3's seat_inventory
  awardHeld: number
  awardSold: number
}

export interface AwardPassenger {
  bookingCouponId: string
  isLapInfant: boolean
}

export interface RedeemRowDraft {
  bookingCouponId: string
  miles: number // negative
}

export type RedeemRefusal = 'past_cutoff' | 'not_enough_seats' | 'not_enough_miles' | 'no_seat_passengers'

export function awardSeatsLeft(seats: AwardSeats): number {
  return Math.max(0, seats.awardLimit - seats.awardHeld - seats.awardSold)
}

// Miles bookings close award_cutoff_hours before departure; feature 3 reads the same setting.
export function awardOpen(depAt: Date, now: Date, cutoffHours: number): boolean {
  return now < addHours(depAt, -cutoffHours)
}

// One redeem row per award coupon, for that seat's miles_cost. A lap infant takes no seat and has no redeem row.
// This is the pre-check for a 409; the seat_inventory row lock and miles_balance >= 0 settle a race in the database.
export function draftRedemption(input: {
  passengers: readonly AwardPassenger[]
  milesCost: number
  seats: AwardSeats
  balance: number
  depAt: Date
  now: Date
  cutoffHours: number
}): { rows: RedeemRowDraft[]; totalMiles: number } | { refusal: RedeemRefusal } {
  if (!awardOpen(input.depAt, input.now, input.cutoffHours)) return { refusal: 'past_cutoff' }
  const seated = input.passengers.filter((p) => !p.isLapInfant)
  if (seated.length === 0) return { refusal: 'no_seat_passengers' }
  if (seated.length > awardSeatsLeft(input.seats)) return { refusal: 'not_enough_seats' }
  const totalMiles = seated.length * input.milesCost
  if (totalMiles > input.balance) return { refusal: 'not_enough_miles' }
  return { rows: seated.map((p) => ({ bookingCouponId: p.bookingCouponId, miles: -input.milesCost })), totalMiles }
}

// The redeem rows to give back when feature 3 expires or cancels award coupons. A row already reversed is skipped,
// which the UNIQUE (reversed_transaction_id, member_id) would refuse anyway.
export function draftReversals(
  ledger: readonly LedgerRow[],
  redeemIds: readonly string[],
): { reversedTransactionId: string; miles: number }[] {
  const reversed = new Set(ledger.filter((r) => r.type === 'redeem_reversal').map((r) => r.reversedTransactionId))
  const byId = new Map(ledger.map((r) => [r.id, r]))
  return redeemIds.flatMap((id) => {
    const row = byId.get(id)
    if (!row || row.type !== 'redeem' || reversed.has(id)) return []
    return [{ reversedTransactionId: id, miles: -row.miles }]
  })
}

// Return to cash lowers award_limit to the seats in use, so no seats move between fare classes.
export function awardLimitOnReturnToCash(seats: AwardSeats): number {
  return seats.awardHeld + seats.awardSold
}
