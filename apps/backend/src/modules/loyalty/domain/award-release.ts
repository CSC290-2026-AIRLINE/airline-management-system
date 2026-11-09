import { awardOpen, awardSeatsLeft, type AwardSeats } from './redemption'

export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export const CABINS: readonly Cabin[] = ['economy', 'premium_economy', 'business', 'first']

// Feature 2's flight.status. Award seats can be released, changed or redeemed only while a flight is still for sale.
export const OPEN_FLIGHT_STATUSES = ['scheduled', 'delayed'] as const
export const isOpenFlight = (status: string) => (OPEN_FLIGHT_STATUSES as readonly string[]).includes(status)

// The four statuses the Award Release page shows. Everything after take-off reads as departed.
export type AwardFlightStatus = 'scheduled' | 'delayed' | 'cancelled' | 'departed'
export function awardFlightStatus(status: string): AwardFlightStatus {
  if (status === 'scheduled' || status === 'delayed' || status === 'cancelled') return status
  return 'departed' // departed, holding, diverted, arrived
}

export type ReleaseRefusal = 'flight_closed' | 'past_cutoff' | 'bad_seats' | 'bad_miles' | 'below_taken'

/**
 * Checks a release (or an edit of one) before it writes the price and sets `award_limit`. The seats can never go below
 * the award seats already held or sold; whether the cabin has that many unsold seats is settled by feature 3's
 * `seat_inventory_no_oversell` trigger under the row lock.
 */
export function checkRelease(input: {
  flightStatus: string
  depAt: Date
  now: Date
  cutoffHours: number
  seats: number
  milesCost: number
  seatsTaken: number // award_held_count + award_sold_count
}): ReleaseRefusal | null {
  if (!isOpenFlight(input.flightStatus) || input.depAt <= input.now) return 'flight_closed'
  if (!awardOpen(input.depAt, input.now, input.cutoffHours)) return 'past_cutoff'
  if (!Number.isInteger(input.seats) || input.seats < 0) return 'bad_seats'
  if (!Number.isInteger(input.milesCost) || input.milesCost <= 0) return 'bad_miles'
  if (input.seats < input.seatsTaken) return 'below_taken'
  return null
}

export interface AwardOffer {
  milesCost: number
  seatsLeft: number
  seatsNeeded: number // adults and children; a lap infant takes no seat
  milesTotal: number
  open: boolean // before the cutoff, flight still for sale
  available: boolean // open and enough award seats for the party
}

/** What search shows beside the cash price: "or 8,000 miles", and whether the whole party fits. */
export function awardOffer(input: {
  milesCost: number
  seats: AwardSeats
  party: { adults: number; children: number }
  flightStatus: string
  depAt: Date
  now: Date
  cutoffHours: number
}): AwardOffer {
  const seatsNeeded = Math.max(0, input.party.adults) + Math.max(0, input.party.children)
  const seatsLeft = awardSeatsLeft(input.seats)
  const open = isOpenFlight(input.flightStatus) && awardOpen(input.depAt, input.now, input.cutoffHours)
  return {
    milesCost: input.milesCost,
    seatsLeft,
    seatsNeeded,
    milesTotal: input.milesCost * seatsNeeded,
    open,
    available: open && seatsNeeded > 0 && seatsLeft >= seatsNeeded,
  }
}
