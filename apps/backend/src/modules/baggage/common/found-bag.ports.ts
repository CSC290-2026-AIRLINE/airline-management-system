import type { FoundBag, FoundBagStatus } from './found-bag.types'

export interface FoundBagFilter {
  tagNumber?: string
  status?: FoundBagStatus
  foundAirport?: string
  flightId?: string
}

/**
 * Same shape as report.ports.ts SimulationClock on feat-10-lost-baggage-report.
 * Merge the two once that branch is in dev.
 */
export interface FoundBagClock {
  now(): Date
}

export const FOUND_BAG_CLOCK = Symbol('FOUND_BAG_CLOCK')

/**
 * Feature 6's checked_bag with the same tag, read through its check_in.
 */
export interface CheckedBagRecord {
  checkedBagId: string
  tagNumber: string
  bookingPassengerId: string
  flightId: string
}

/**
 * Called after a found bag is saved. The matching branch plugs in here.
 */
export interface FoundBagRecordedListener {
  onFoundBagRecorded(bag: FoundBag, checkedBag: CheckedBagRecord | null): Promise<void>
}

export const FOUND_BAG_RECORDED_LISTENERS = Symbol('FOUND_BAG_RECORDED_LISTENERS')
