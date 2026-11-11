import type { BookingVerification, EligibleTraveller, VerifiedBookingPassenger, VerifiedReportFlight } from '../common/report.ports'

export interface MockBookingRecord extends VerifiedBookingPassenger {
  bookingReference: string
  surname: string
}

export class MockBookingVerification implements BookingVerification {
  constructor(private readonly bookings: readonly MockBookingRecord[] = []) {}

  verifyPassenger(input: {
    bookingReference: string
    surname: string
    passengerId: string
    flightId?: string
  }): Promise<VerifiedBookingPassenger | null> {
    const booking = this.bookings.find(
      (item) =>
        item.bookingReference.toUpperCase() === input.bookingReference.toUpperCase() &&
        item.surname.toLowerCase() === input.surname.toLowerCase() &&
        item.passengerId === input.passengerId &&
        (!input.flightId || item.flightId === input.flightId),
    )

    if (!booking) return Promise.resolve(null)

    return Promise.resolve({
      bookingPassengerId: booking.bookingPassengerId,
      passengerId: booking.passengerId,
      flightId: booking.flightId,
    })
  }

  listConfirmedFlights(): Promise<VerifiedReportFlight[]> {
    return Promise.resolve([])
  }

  listEligibleTravellers(): Promise<EligibleTraveller[]> {
    return Promise.resolve([])
  }

  /** Same rule as the Prisma adapter: the requester verifies on any flight and the booking passenger shares the booking. */
  async isOnRequesterBooking(
    input: { bookingReference: string; surname: string; passengerId: string },
    bookingPassengerId: string,
  ): Promise<boolean> {
    const requester = await this.verifyPassenger({
      bookingReference: input.bookingReference,
      surname: input.surname,
      passengerId: input.passengerId,
    })
    if (!requester) return false

    return this.bookings.some(
      (item) =>
        item.bookingReference.toUpperCase() === input.bookingReference.toUpperCase() && item.bookingPassengerId === bookingPassengerId,
    )
  }

  /**
   * Same rules as the Prisma adapter: the requester verifies on the booking on any flight (no flightId), and the chosen
   * traveller must share that booking reference with a coupon for the requested flight.
   */
  async resolveTraveller(input: {
    bookingReference: string
    surname: string
    passengerId: string
    bookingPassengerId: string
    flightId: string
  }): Promise<VerifiedBookingPassenger | null> {
    const requester = await this.verifyPassenger({
      bookingReference: input.bookingReference,
      surname: input.surname,
      passengerId: input.passengerId,
    })
    if (!requester) return null

    const traveller = this.bookings.find(
      (item) =>
        item.bookingReference.toUpperCase() === input.bookingReference.toUpperCase() &&
        item.bookingPassengerId === input.bookingPassengerId &&
        item.flightId === input.flightId,
    )

    return traveller
      ? { bookingPassengerId: traveller.bookingPassengerId, passengerId: traveller.passengerId, flightId: traveller.flightId }
      : null
  }
}
