import type { FoundBag, FoundBagStatus } from './found-bag.types'

export interface FoundBagFilter {
  tagNumber?: string
  status?: FoundBagStatus
  foundAirport?: string
  flightId?: string
}

export interface FoundBagRepository {
  create(bag: FoundBag): Promise<FoundBag>

  findById(id: string): Promise<FoundBag | null>

  findByCheckedBagId(checkedBagId: string): Promise<FoundBag | null>

  list(filter: FoundBagFilter): Promise<FoundBag[]>
}

/**
 * Same shape as report.ports.ts SimulationClock on feat-10-lost-baggage-report.
 * Merge the two once that branch is in dev.
 */
export interface FoundBagClock {
  now(): Date
}

/**
 * Temporary F6 contract for GET /staff/bags/:tagNumber.
 * Align with Feature 6's real provider when available.
 */
export interface CheckedBagRecord {
  checkedBagId: string
  tagNumber: string
  bookingPassengerId: string
  flightId: string
}

export interface CheckedBagDetailsLookup {
  findByTag(tagNumber: string): Promise<CheckedBagRecord | null>
}

/**
 * Called after a found bag is saved. The matching branch plugs in here.
 */
export interface FoundBagRecordedListener {
  onFoundBagRecorded(bag: FoundBag, checkedBag: CheckedBagRecord | null): Promise<void>
}
