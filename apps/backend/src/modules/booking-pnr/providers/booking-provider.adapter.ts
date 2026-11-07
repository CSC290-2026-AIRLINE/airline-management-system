import { Inject, Injectable } from '@nestjs/common'
import { BOOKING_PROVIDER, BOOKING_READ_PORT, type BookingDetail, type BookingReadPort, type FlightPassengerDto } from '../contracts'
import type { BookingPassenger, BookingProvider } from './feature6.types'

// C12: Feature 6's BookingProvider, delegating every read to B's BookingReadPort (no booking queries here).
// Feature 6 wires this into its own module once both features are on dev.

const LIVE_REQUEST_STATUSES = new Set(['requested', 'accepted'])

/** One BookingPassenger per live coupon (held or confirmed) of the booking. */
export function toBookingPassengers(detail: BookingDetail): BookingPassenger[] {
  const order = new Map(detail.segments.map((s) => [s.bookingSegmentId, s.segmentOrder]))
  const coupons = [...detail.coupons].sort((a, b) => (order.get(a.bookingSegmentId) ?? 0) - (order.get(b.bookingSegmentId) ?? 0))
  const result: BookingPassenger[] = []
  for (const coupon of coupons) {
    if (coupon.status !== 'held' && coupon.status !== 'confirmed') continue
    const passenger = detail.passengers.find((p) => p.bookingPassengerId === coupon.bookingPassengerId)
    const segment = detail.segments.find((s) => s.bookingSegmentId === coupon.bookingSegmentId)
    if (!passenger || !segment) continue
    const specialAssistance = detail.serviceRequests
      .filter(
        (r) =>
          r.bookingPassengerId === coupon.bookingPassengerId &&
          (r.bookingSegmentId === null || r.bookingSegmentId === coupon.bookingSegmentId) &&
          LIVE_REQUEST_STATUSES.has(r.status),
      )
      .map((r) => r.serviceCode)
    result.push({
      bookingPassengerId: coupon.bookingPassengerId,
      pnr: detail.reference,
      paid: coupon.status === 'confirmed',
      flightId: coupon.flightId,
      passengerId: coupon.passengerId,
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      cabin: segment.cabin,
      fareClass: segment.fareClassCode ?? '',
      specialAssistance,
      // Air marshals come from Feature 8 through Feature 6's own PoliceProvider, not from the booking.
      isPolice: false,
    })
  }
  return result
}

export function flightPassengerToBookingPassenger(flightId: string, p: FlightPassengerDto): BookingPassenger {
  return {
    bookingPassengerId: p.bookingPassengerId,
    pnr: p.bookingReference,
    // listFlightPassengers returns confirmed passengers only.
    paid: true,
    flightId,
    passengerId: p.passengerId,
    firstName: p.firstName,
    lastName: p.lastName,
    cabin: p.cabin,
    fareClass: p.fareClassCode ?? '',
    specialAssistance: p.serviceCodes,
    isPolice: false,
  }
}

@Injectable()
export class BookingProviderAdapter implements BookingProvider {
  constructor(@Inject(BOOKING_READ_PORT) private readonly readPort: BookingReadPort) {}

  async findByPnrAndLastName(pnr: string, lastName: string): Promise<BookingPassenger[]> {
    const detail = await this.readPort.findBookingByReferenceAndSurname(pnr, lastName)
    return detail ? toBookingPassengers(detail) : []
  }

  // Open item: Feature 6 assumes one flight per booking passenger. Until it also sends the flight id, this returns the
  // passenger's first live coupon in segment order.
  async byBookingPassengerId(id: string): Promise<BookingPassenger | null> {
    const detail = await this.readPort.getBookingForPassenger(id)
    if (!detail) return null
    return toBookingPassengers(detail).find((p) => p.bookingPassengerId === id) ?? null
  }

  async listByFlight(flightId: string): Promise<BookingPassenger[]> {
    const passengers = await this.readPort.listFlightPassengers(flightId)
    return passengers.map((p) => flightPassengerToBookingPassenger(flightId, p))
  }
}

export { BOOKING_PROVIDER }
