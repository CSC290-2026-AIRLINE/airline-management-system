import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BAGGAGE_ERROR_CODES, BaggageError } from './common/baggage.errors'
import type { VerifiedBookingPassenger } from './common/report.ports'

/** The same booking-reference shape as the signed-in lookup (PassengerReportAccessQuery), compared upper-case. */
const BOOKING_REFERENCE_PATTERN = /^[A-Z0-9]{6}$/
const SURNAME_MAX_LENGTH = 100
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9]{2,10}$/
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

/**
 * "Whose bag is it?" for a guest: a passenger on the verified booking whose surname matches, with the flights they hold
 * a confirmed coupon for. Only what the selector needs: an opaque traveller id (re-verified on every submission, never
 * trusted), the name as on the booking, and the flights.
 */
export interface GuestTravellerOption {
  travellerId: string
  displayName: string
  flights: GuestEligibleFlight[]
}

/** The traveller and flight a guest picked, as sent by the client: every field is untrusted. */
export interface GuestTravellerSelection {
  bookingReference: unknown
  surname: unknown
  travellerId: unknown
  flightNumber: unknown
  serviceDate: unknown
}

/** A guest selection verified on the server: the ids come from the database, not from the request. */
export interface GuestVerifiedTraveller extends VerifiedBookingPassenger {
  flightNumber: string
  serviceDate: string
}

/** Every failure looks the same, so a caller cannot tell a malformed request from an unknown booking or surname. */
export function verificationFailed(): BaggageError {
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
      where: matchingCoupons(access),
      select: { flight_id: true },
      distinct: ['flight_id'],
    })

    if (coupons.length === 0) throw verificationFailed()

    const flights = await this.loadFlights(coupons.map(({ flight_id }) => flight_id))

    if (flights.length === 0) throw verificationFailed()

    return flights.map(({ flight }) => flight)
  }

  /**
   * The travellers a guest can report for: every passenger on the booking whose surname matches (several when they share
   * it), each with their confirmed flights. Passengers with another surname are not listed: a guest proves only the
   * reference and a surname, and no guest co-traveller rule is defined beyond that.
   */
  async listEligibleTravellers(input: unknown): Promise<GuestTravellerOption[]> {
    const access = normalizeGuestBookingAccess(input)
    if (!access) throw verificationFailed()

    const coupons = await this.db.booking_coupon.findMany({
      where: matchingCoupons(access),
      select: {
        booking_passenger_id: true,
        flight_id: true,
        booking_passenger: { select: { passenger: { select: { first_name: true, last_name: true } } } },
      },
    })

    if (coupons.length === 0) throw verificationFailed()

    const flights = await this.loadFlights([...new Set(coupons.map(({ flight_id }) => flight_id))])
    const flightOrder = new Map(flights.map(({ id }, index) => [id, index]))
    const travellers = new Map<string, GuestTravellerOption & { flightIds: Set<string> }>()

    for (const coupon of coupons) {
      if (!flightOrder.has(coupon.flight_id)) continue
      let traveller = travellers.get(coupon.booking_passenger_id)
      if (!traveller) {
        const { first_name, last_name } = coupon.booking_passenger.passenger
        traveller = {
          travellerId: coupon.booking_passenger_id,
          displayName: `${first_name} ${last_name}`.trim(),
          flights: [],
          flightIds: new Set(),
        }
        travellers.set(coupon.booking_passenger_id, traveller)
      }
      traveller.flightIds.add(coupon.flight_id)
    }

    const options = [...travellers.values()]
      .map(({ travellerId, displayName, flightIds }) => ({
        travellerId,
        displayName,
        flights: flights.filter(({ id }) => flightIds.has(id)).map(({ flight }) => flight),
      }))
      .filter(({ flights: travellerFlights }) => travellerFlights.length > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.travellerId.localeCompare(b.travellerId))

    if (options.length === 0) throw verificationFailed()

    return options
  }

  /**
   * Verifies a guest's selection for a report, entirely on the server: the reference + surname match a passenger on the
   * booking, the chosen traveller IS one of those passengers (so a traveller from another booking, or with another
   * surname, fails), the flight is found by its number and date, and that traveller holds a confirmed coupon for it.
   * The ids returned come from that coupon. Null on any failure.
   */
  async resolveGuestTraveller(selection: GuestTravellerSelection): Promise<GuestVerifiedTraveller | null> {
    const access = normalizeGuestBookingAccess(selection)
    if (!access) return null

    const { travellerId, flightNumber, serviceDate } = selection
    if (typeof travellerId !== 'string' || !UUID_PATTERN.test(travellerId.trim())) return null
    if (typeof flightNumber !== 'string' || typeof serviceDate !== 'string') return null

    const number = flightNumber.trim().toUpperCase()
    const date = serviceDate.trim()
    if (!FLIGHT_NUMBER_PATTERN.test(number) || !isCalendarDate(date)) return null

    const flight = await this.db.flight.findUnique({
      where: { flight_number_service_date: { flight_number: number, service_date: new Date(`${date}T00:00:00.000Z`) } },
      select: { id: true },
    })
    if (!flight) return null

    const coupon = await this.db.booking_coupon.findFirst({
      where: { ...matchingCoupons(access), booking_passenger_id: travellerId.trim(), flight_id: flight.id },
      select: { booking_passenger_id: true, passenger_id: true, flight_id: true },
    })
    if (!coupon) return null

    return {
      bookingPassengerId: coupon.booking_passenger_id,
      passengerId: coupon.passenger_id,
      flightId: coupon.flight_id,
      flightNumber: number,
      serviceDate: date,
    }
  }

  /** Flights in display order, each with its id kept server-side only (it is never put into a guest response). */
  private async loadFlights(flightIds: string[]): Promise<Array<{ id: string; flight: GuestEligibleFlight }>> {
    const flights = await this.db.flight.findMany({
      where: { id: { in: flightIds } },
      select: {
        id: true,
        flight_number: true,
        service_date: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true } },
      },
      orderBy: [{ service_date: 'asc' }, { flight_number: 'asc' }],
    })

    return flights.map((flight) => ({
      id: flight.id,
      flight: {
        flightNumber: flight.flight_number,
        serviceDate: flight.service_date.toISOString().slice(0, 10),
        origin: flight.route.origin,
        destination: flight.actual_destination ?? flight.route.destination,
      },
    }))
  }
}

/** Confirmed coupons held by a non-deleted passenger on the booking whose surname matches (case-insensitive). */
function matchingCoupons(access: GuestBookingAccess) {
  return {
    status: 'confirmed',
    booking_passenger: {
      booking: { booking_reference: access.bookingReference },
      passenger: {
        last_name: { equals: access.surname, mode: 'insensitive' as const },
        deleted_at: null,
      },
    },
  }
}

/** YYYY-MM-DD that is a real calendar day (rejects 2026-02-30). */
function isCalendarDate(value: string): boolean {
  if (!SERVICE_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
