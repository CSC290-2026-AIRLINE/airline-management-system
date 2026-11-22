import type { BookingDetail, HoldBookingRequest, HoldBookingSeat } from '../api/types'

/**
 * The passenger records of a re-book, keyed by the booking passenger they belong to. A passenger whose details did not
 * change keeps the record it already has, so only a corrected name gets a new one.
 */
export type PassengerIds = ReadonlyMap<string, string>

/**
 * The hold that makes the same booking again.
 *
 * The flights, the cabin, the seats, the assistance requests and the contact details come from the booking that is being
 * replaced. The fare quote is not carried over: the backend quotes the flights again, so the customer is asked to confirm
 * the price when it moved.
 */
export function holdRequestForBooking(booking: BookingDetail, passengerIds: PassengerIds): HoldBookingRequest {
  const idFor = (bookingPassengerId: string) => {
    const passengerId = passengerIds.get(bookingPassengerId)
    if (!passengerId) throw new Error(`Passenger ${bookingPassengerId} has no passenger record.`)
    return passengerId
  }

  const segments = [...booking.segments].sort((a, b) => a.segmentOrder - b.segmentOrder)
  const passengers = booking.passengers.map((passenger) => ({
    passengerId: idFor(passenger.bookingPassengerId),
    passengerType: passenger.passengerType,
    // An infant travels on the lap of an adult, so the adult's new record is the one to point at.
    ...(passenger.passengerType === 'infant' && passenger.lapOfBookingPassengerId
      ? { lapOfPassengerId: idFor(passenger.lapOfBookingPassengerId) }
      : {}),
  }))
  const seats = booking.coupons
    .filter((coupon) => coupon.seatCode !== null && coupon.status === 'held')
    .map((coupon) => ({
      passengerId: idFor(coupon.bookingPassengerId),
      flightId: coupon.flightId,
      seatCode: coupon.seatCode as string,
    }))
  const serviceRequests = booking.serviceRequests
    .filter((request) => request.status === 'requested' || request.status === 'accepted')
    .map((request) => ({
      passengerId: idFor(request.bookingPassengerId),
      serviceCode: request.serviceCode,
      ...(request.note ? { note: request.note } : {}),
    }))

  return {
    tripType: booking.tripType,
    paymentType: booking.paymentType,
    passengers,
    segments: segments.map((segment) => ({
      flightId: segment.flightId,
      cabin: segment.cabin,
      fareClassId: segment.fareClassId,
    })),
    contactEmail: booking.contactEmail,
    ...(booking.contactPhone ? { contactPhone: booking.contactPhone } : {}),
    expectedTotal: booking.total,
    ...(seats.length > 0 ? { seats } : {}),
    ...(serviceRequests.length > 0 ? { serviceRequests } : {}),
  }
}

/** The seats of a booking that are still held, as the hold request takes them. */
export function heldSeatsOf(booking: BookingDetail, passengerIds: PassengerIds): HoldBookingSeat[] {
  return holdRequestForBooking(booking, passengerIds).seats ?? []
}
