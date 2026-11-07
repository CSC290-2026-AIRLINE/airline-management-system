import { Matches } from 'class-validator'

/** Path of `GET /api/staff/lost-reports/bookings/:bookingReference`. The service repeats the check. */
export class BookingReferenceParam {
  @Matches(/^[A-Za-z0-9]{6}$/, { message: 'bookingReference must be 6 letters or digits' })
  bookingReference: string
}
