import type { BookingDetail } from '../api/types'

export function heldSeatCount(booking: BookingDetail): number {
  const passengerTypes = new Map(booking.passengers.map((passenger) => [passenger.bookingPassengerId, passenger.passengerType]))
  return booking.coupons.filter((coupon) => passengerTypes.get(coupon.bookingPassengerId) !== 'infant').length
}
