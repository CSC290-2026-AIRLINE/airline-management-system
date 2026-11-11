import type { LostBagReport } from './report.types'
import type { DeliveryStatus, DeliveryType } from './bag-delivery.types'

export interface DeliveryChoiceSnapshot {
  deliveryType: DeliveryType | null
  address: string | null
  pickupAirport: string | null
  status: DeliveryStatus
}

export interface ReportRepository {
  create(report: LostBagReport): Promise<LostBagReport>

  findByCaseNumber(caseNumber: string): Promise<LostBagReport | null>

  findDeliveryIdByReportId(reportId: string): Promise<string | null>

  findDeliveryChoiceByReportId(reportId: string): Promise<DeliveryChoiceSnapshot | null>

  findLiveByTag(tagNumber: string): Promise<LostBagReport | null>

  listByBookingPassengerId(bookingPassengerId: string): Promise<LostBagReport[]>

  cancelIfNotDispatched(reportId: string, bookingPassengerId: string, closedAt: Date): Promise<LostBagReport | null>
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

export interface VerifiedReportFlight {
  flightId: string
  flightNumber: string
  serviceDate: Date
  origin: string
  destination: string
}

/**
 * A traveller on a verified booking who holds at least one confirmed coupon ("Whose bag is it?").
 * Only what the selector needs: no contact details, documents, or other bookings.
 */
export interface EligibleTraveller {
  bookingPassengerId: string
  displayName: string
  /** True for the signed-in customer's own passenger. */
  isYou: boolean
  flights: VerifiedReportFlight[]
}

export interface BookingVerification {
  verifyPassenger(input: {
    bookingReference: string
    surname: string
    passengerId: string
    flightId?: string
  }): Promise<VerifiedBookingPassenger | null>

  listConfirmedFlights(input: { bookingReference: string; surname: string; passengerId: string }): Promise<VerifiedReportFlight[]>

  /** Travellers on the requester's verified booking; empty when the requester does not verify. */
  listEligibleTravellers(input: { bookingReference: string; surname: string; passengerId: string }): Promise<EligibleTraveller[]>

  /** A traveller on the requester's own verified booking with a confirmed coupon for the flight; null otherwise. */
  resolveTraveller(input: {
    bookingReference: string
    surname: string
    passengerId: string
    bookingPassengerId: string
    flightId: string
  }): Promise<VerifiedBookingPassenger | null>

  /** Case viewing: the requester verifies and the booking passenger is on the requester's booking. */
  isOnRequesterBooking(
    input: { bookingReference: string; surname: string; passengerId: string },
    bookingPassengerId: string,
  ): Promise<boolean>
}

export interface CheckedBagOwnership {
  tagNumber: string
  bookingPassengerId: string
  flightId: string
}

export interface CheckedBagLookup {
  findByTag(tagNumber: string): Promise<CheckedBagOwnership | null>
}
