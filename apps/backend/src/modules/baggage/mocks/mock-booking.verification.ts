import type { BookingVerification, VerifiedBookingPassenger } from '../common/report.ports'

export interface MockBookingRecord extends VerifiedBookingPassenger {
  bookingReference: string
  surname: string
}

export class MockBookingVerification implements BookingVerification {
  constructor(private readonly bookings: readonly MockBookingRecord[] = []) {}

  verifyPassenger(input: { bookingReference: string; surname: string; passengerId: string }): Promise<VerifiedBookingPassenger | null> {
    const booking = this.bookings.find(
      (item) =>
        item.bookingReference.toUpperCase() === input.bookingReference.toUpperCase() &&
        item.surname.toLowerCase() === input.surname.toLowerCase() &&
        item.passengerId === input.passengerId,
    )

    if (!booking) return Promise.resolve(null)

    return Promise.resolve({
      bookingPassengerId: booking.bookingPassengerId,
      passengerId: booking.passengerId,
      flightId: booking.flightId,
    })
  }
}
