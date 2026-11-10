import type { BookingDetail, BookingPassenger, BookingStatus, PassengerCounts, ServiceRequestStatus } from '../api/types'
import type { ChipTone } from '../components/StatusChip'
import { formatDateTime, formatPassengerCounts } from '../lib/format'

/**
 * Everything the Booking Detail page shows that is not plain data: the roles of the passengers, the chips, the
 * counts of the cancel copy and the reasons why a feature is not connected yet.
 */

// The links of this page that point at a feature that is not built yet. The reason is the tooltip of the link.
export const CHANGE_BOOKING_DISABLED = 'Changing a booking is not available yet.'
export const COMPLAINT_DISABLED = 'Complaints (feature 13) are not connected yet.'
export const SEAT_PICKER_DISABLED = 'Seat selection (feature 3) is not connected yet.'
export const ASSISTANCE_DISABLED = 'Assistance requests (feature 3) are not connected yet.'
export const CHECK_IN_DISABLED = 'Check-in and boarding passes (feature 6) are not connected yet.'
export const MEALS_DISABLED = 'Meals (feature 12) are not connected yet.'
export const LOST_BAG_DISABLED = 'Lost baggage reports (feature 10) are not connected yet.'

// Meals and the onboard shop close 48 hours before departure.
export const MEALS_CUTOFF_MS = 48 * 60 * 60 * 1000

export interface Chip {
  label: string
  tone: ChipTone
}

export type PassengerRole = 'Account holder' | 'Adult' | 'Child' | 'Infant'

/**
 * The role under the name of a passenger. The lead passenger of the booking is the account holder; the read model
 * does not say who the customer is, so the first passenger of the booking stands for the account holder.
 */
export function passengerRole(passenger: BookingPassenger, index: number): PassengerRole {
  if (index === 0) {
    return 'Account holder'
  }

  switch (passenger.passengerType) {
    case 'adult':
      return 'Adult'
    case 'child':
      return 'Child'
    case 'infant':
      return 'Infant'
    default: {
      const unreachable: never = passenger.passengerType
      return unreachable
    }
  }
}

/** The first letter of a name, for the avatar of a passenger. */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase()
}

/** "1 adult, 1 child" — the party of a booking, under the title. */
export function partyLabel(passengers: BookingPassenger[]): string {
  const counts: PassengerCounts = { adults: 0, children: 0, infants: 0 }

  for (const passenger of passengers) {
    if (passenger.passengerType === 'adult') {
      counts.adults += 1
    } else if (passenger.passengerType === 'child') {
      counts.children += 1
    } else {
      counts.infants += 1
    }
  }

  return formatPassengerCounts(counts)
}

/**
 * The chip of the booking itself. A booking whose last flight has left keeps its 'confirmed' status. The status can be
 * given, because the page shows a hold as expired as soon as its countdown reaches zero, before the server has moved
 * the booking.
 */
export function bookingChip(booking: BookingDetail, status: BookingStatus = booking.status): Chip {
  if (status === 'confirmed' && hasDeparted(booking)) {
    return { label: 'Completed', tone: 'completed' }
  }

  switch (status) {
    case 'held':
      return { label: 'Held', tone: 'held' }
    case 'confirmed':
      return { label: 'Confirmed', tone: 'confirmed' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'cancelled' }
    case 'expired':
      return { label: 'Expired', tone: 'expired' }
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** The chip of a coupon. A coupon that is still usable is "Open". */
export function couponChip(status: BookingStatus): Chip {
  switch (status) {
    case 'held':
    case 'confirmed':
      return { label: 'Open', tone: 'completed' }
    case 'cancelled':
      return { label: 'Cancelled', tone: 'cancelled' }
    case 'expired':
      return { label: 'Expired', tone: 'expired' }
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** The chip of an assistance request. The database value 'requested' is shown as "Pending" (D13). */
export function serviceRequestChip(status: ServiceRequestStatus): Chip {
  switch (status) {
    case 'requested':
      return { label: 'Pending', tone: 'held' }
    case 'accepted':
      return { label: 'Accepted', tone: 'confirmed' }
    case 'rejected':
      return { label: 'Rejected', tone: 'cancelled' }
    case 'completed':
      return { label: 'Completed', tone: 'completed' }
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

/** The coupons that still hold something: the flights of a booking that are not cancelled or expired. */
export function liveCoupons(booking: BookingDetail) {
  return booking.coupons.filter((coupon) => coupon.status === 'held' || coupon.status === 'confirmed')
}

/** The seats a cancellation releases. Infants travel on a lap and hold no seat. */
export function seatCount(booking: BookingDetail): number {
  const infants = new Set(
    booking.passengers.filter((passenger) => passenger.passengerType === 'infant').map((passenger) => passenger.bookingPassengerId),
  )

  return liveCoupons(booking).filter((coupon) => !infants.has(coupon.bookingPassengerId)).length
}

export interface OrderingWindow {
  open: boolean
  // When the onboard ordering closes: 48 hours before the first departure.
  closesAt: string | null
}

/** Whether the onboard shop of this booking is still open. */
export function orderingWindow(booking: BookingDetail): OrderingWindow {
  const first = booking.segments[0]
  if (!first) {
    return { open: false, closesAt: null }
  }

  const closesAt = new Date(Date.parse(first.depAt) - MEALS_CUTOFF_MS)
  return { open: Date.parse(booking.serverNow) < closesAt.getTime(), closesAt: closesAt.toISOString() }
}

/** The green banner of the onboard shop: "Ordering open · Closes Sat 10 Oct, 09:40, 48 hours before departure." */
export function orderingLabel(ordering: OrderingWindow): string {
  if (!ordering.closesAt) {
    return 'Onboard ordering is not available for this booking.'
  }

  const closes = formatDateTime(ordering.closesAt)
  return ordering.open ? `Ordering open · Closes ${closes}, 48 hours before departure.` : `Ordering closed · It closed ${closes}.`
}

/** Whether the last flight of the booking has left. */
function hasDeparted(booking: BookingDetail): boolean {
  const last = booking.segments[booking.segments.length - 1]
  if (!last) {
    return false
  }
  return Date.parse(last.depAt) < Date.parse(booking.serverNow)
}
