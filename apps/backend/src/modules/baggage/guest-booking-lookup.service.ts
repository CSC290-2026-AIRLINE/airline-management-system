import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'

/** The same booking-reference shape as the signed-in lookup (PassengerReportAccessQuery), compared upper-case. */
const BOOKING_REFERENCE_PATTERN = /^[A-Z0-9]{6}$/
const SURNAME_MAX_LENGTH = 100

export interface GuestBookingAccess {
  bookingReference: string
  surname: string
}

/**
 * A flight a guest may report a lost bag for, with only what the report form shows. No internal ids (not even the
 * flight's), no passenger names, no contact details, nothing from other bookings.
 */
export interface GuestEligibleFlight {
  flightNumber: string
  /** Date only, YYYY-MM-DD. */
  serviceDate: string
  origin: string
  /** Where the flight actually landed if it was diverted, otherwise its scheduled destination. */
  destination: string
}

/** Every failure looks the same, so a caller cannot tell a malformed request from an unknown booking or surname. */
function verificationFailed(): BaggageError {
  return new BaggageError(BAGGAGE_ERROR_CODES.INVALID_REPORT, 'Booking verification failed')
}

/** Trims and upper-cases the input as the signed-in lookup does; null when either value is missing or malformed. */
export function normalizeGuestBookingAccess(input: unknown): GuestBookingAccess | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const { bookingReference, surname } = input as Record<string, unknown>
  if (typeof bookingReference !== 'string' || typeof surname !== 'string') return null

  const reference = bookingReference.trim().toUpperCase()
  const name = surname.trim()
  if (!BOOKING_REFERENCE_PATTERN.test(reference) || !name || name.length > SURNAME_MAX_LENGTH) return null

  return { bookingReference: reference, surname: name }
}

/**
 * Guest (no-account) booking lookup for lost bag reporting: booking reference + surname, checked on the server. Read
 * only. It lists the flights with a confirmed coupon held by a passenger on that booking whose surname matches, using
 * the signed-in lookup's eligibility rules (PrismaBookingVerification.listConfirmedFlights) without its signed-in
 * passenger condition. It does not identify or select a passenger: when several passengers on the booking share the
 * surname, their eligible flights are listed together.
 */
@Injectable()
export class GuestBookingLookupService {
  constructor(private readonly db: DbService) {}

  async listEligibleFlights(input: unknown): Promise<GuestEligibleFlight[]> {
    const access = normalizeGuestBookingAccess(input)
    if (!access) throw verificationFailed()

    const coupons = await this.db.booking_coupon.findMany({
      where: {
        status: 'confirmed',
        booking_passenger: {
          booking: { booking_reference: access.bookingReference },
          passenger: {
            last_name: { equals: access.surname, mode: 'insensitive' },
            deleted_at: null,
          },
        },
      },
      select: { flight_id: true },
      distinct: ['flight_id'],
    })

    if (coupons.length === 0) throw verificationFailed()

    const flights = await this.db.flight.findMany({
      where: { id: { in: coupons.map(({ flight_id }) => flight_id) } },
      select: {
        flight_number: true,
        service_date: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true } },
      },
      orderBy: [{ service_date: 'asc' }, { flight_number: 'asc' }],
    })

    if (flights.length === 0) throw verificationFailed()

    return flights.map((flight) => ({
      flightNumber: flight.flight_number,
      serviceDate: flight.service_date.toISOString().slice(0, 10),
      origin: flight.route.origin,
      destination: flight.actual_destination ?? flight.route.destination,
    }))
  }
}
