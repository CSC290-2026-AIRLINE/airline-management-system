import type { LostBagReport } from './report.types'

export interface ReportRepository {
  create(report: LostBagReport): Promise<LostBagReport>

  findByCaseNumber(caseNumber: string): Promise<LostBagReport | null>

  findLiveByTag(tagNumber: string): Promise<LostBagReport | null>

  listByBookingPassengerId(bookingPassengerId: string): Promise<LostBagReport[]>
}

export interface CaseNumberSequence {
  next(): Promise<number>
}

export interface SimulationClock {
  now(): Date
}

/**
 * Temporary F3b/F7 booking and F6 baggage lookup contracts.
 * Align these interfaces with the real integrations when available.
 */
export interface VerifiedBookingPassenger {
  bookingPassengerId: string
  passengerId: string
  flightId: string
}

export interface BookingVerification {
  verifyPassenger(input: { bookingReference: string; surname: string; passengerId: string }): Promise<VerifiedBookingPassenger | null>
}

export interface CheckedBagOwnership {
  tagNumber: string
  bookingPassengerId: string
}

export interface CheckedBagLookup {
  findByTag(tagNumber: string): Promise<CheckedBagOwnership | null>
}
