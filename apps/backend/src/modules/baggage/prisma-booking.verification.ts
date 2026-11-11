import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { BookingVerification, EligibleTraveller, VerifiedBookingPassenger, VerifiedReportFlight } from './common/report.ports'

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

@Injectable()
export class PrismaBookingVerification implements BookingVerification {
  constructor(private readonly db: DbService) {}

  async verifyPassenger(input: {
    bookingReference: string
    surname: string
    passengerId: string
    flightId?: string
  }): Promise<VerifiedBookingPassenger | null> {
    const reference = input.bookingReference?.trim().toUpperCase()
    const surname = input.surname?.trim()
    const passengerId = input.passengerId?.trim()
    const flightId = input.flightId?.trim()

    if (!reference || !surname || !passengerId || !UUID_PATTERN.test(passengerId) || (flightId && !UUID_PATTERN.test(flightId))) {
      return null
    }

    const coupon = await this.db.booking_coupon.findFirst({
      where: {
        status: 'confirmed',
        passenger_id: passengerId,
        ...(flightId ? { flight_id: flightId } : {}),
        booking_passenger: {
          booking: {
            booking_reference: reference,
          },
          passenger: {
            last_name: {
              equals: surname,
              mode: 'insensitive',
            },
            deleted_at: null,
          },
        },
      },
      select: {
        booking_passenger_id: true,
        passenger_id: true,
        flight_id: true,
      },
      orderBy: {
        created_at: 'asc',
      },
    })

    if (!coupon) {
      return null
    }

    return {
      bookingPassengerId: coupon.booking_passenger_id,
      passengerId: coupon.passenger_id,
      flightId: coupon.flight_id,
    }
  }

  async listConfirmedFlights(input: { bookingReference: string; surname: string; passengerId: string }): Promise<VerifiedReportFlight[]> {
    const reference = input.bookingReference?.trim().toUpperCase()
    const surname = input.surname?.trim()
    const passengerId = input.passengerId?.trim()

    if (!reference || !surname || !passengerId || !UUID_PATTERN.test(passengerId)) {
      return []
    }

    const coupons = await this.db.booking_coupon.findMany({
      where: {
        status: 'confirmed',
        passenger_id: passengerId,
        booking_passenger: {
          booking: { booking_reference: reference },
          passenger: {
            last_name: { equals: surname, mode: 'insensitive' },
            deleted_at: null,
          },
        },
      },
      select: { flight_id: true },
      distinct: ['flight_id'],
    })

    if (coupons.length === 0) return []

    return this.loadFlights(coupons.map(({ flight_id }) => flight_id))
  }

  /**
   * Travellers on the requester's booking who hold a confirmed coupon, for "Whose bag is it?". The requester must first
   * pass the same reference + surname check as every other passenger call; otherwise nothing is returned.
   */
  async listEligibleTravellers(input: { bookingReference: string; surname: string; passengerId: string }): Promise<EligibleTraveller[]> {
    const bookingId = await this.findRequesterBookingId(input)
    if (!bookingId) return []

    const coupons = await this.db.booking_coupon.findMany({
      where: {
        status: 'confirmed',
        booking_passenger: { booking_id: bookingId, passenger: { deleted_at: null } },
      },
      select: {
        booking_passenger_id: true,
        flight_id: true,
        booking_passenger: { select: { passenger_id: true, passenger: { select: { first_name: true, last_name: true } } } },
      },
    })

    if (coupons.length === 0) return []

    const flights = await this.loadFlights([...new Set(coupons.map(({ flight_id }) => flight_id))])
    const flightsById = new Map(flights.map((flight) => [flight.flightId, flight]))
    const travellers = new Map<string, EligibleTraveller>()

    for (const coupon of coupons) {
      let traveller = travellers.get(coupon.booking_passenger_id)
      if (!traveller) {
        const { passenger_id, passenger } = coupon.booking_passenger
        traveller = {
          bookingPassengerId: coupon.booking_passenger_id,
          displayName: `${passenger.first_name} ${passenger.last_name}`.trim(),
          isYou: passenger_id === input.passengerId.trim(),
          flights: [],
        }
        travellers.set(coupon.booking_passenger_id, traveller)
      }
      const flight = flightsById.get(coupon.flight_id)
      if (flight && !traveller.flights.some(({ flightId }) => flightId === flight.flightId)) traveller.flights.push(flight)
    }

    for (const traveller of travellers.values()) {
      traveller.flights.sort((a, b) => flights.indexOf(a) - flights.indexOf(b))
    }

    return [...travellers.values()]
      .filter(({ flights: travellerFlights }) => travellerFlights.length > 0)
      .sort((a, b) => Number(b.isYou) - Number(a.isYou) || a.displayName.localeCompare(b.displayName))
  }

  /**
   * Resolves a traveller chosen in "Whose bag is it?". Returns null unless the requester passes the reference + surname
   * check AND the chosen booking passenger is on that same booking with a confirmed coupon for the flight, so a traveller
   * from an unrelated booking can never be selected.
   */
  async resolveTraveller(input: {
    bookingReference: string
    surname: string
    passengerId: string
    bookingPassengerId: string
    flightId: string
  }): Promise<VerifiedBookingPassenger | null> {
    const bookingPassengerId = input.bookingPassengerId?.trim()
    const flightId = input.flightId?.trim()
    if (!bookingPassengerId || !flightId || !UUID_PATTERN.test(bookingPassengerId) || !UUID_PATTERN.test(flightId)) return null

    const bookingId = await this.findRequesterBookingId(input)
    if (!bookingId) return null

    const coupon = await this.db.booking_coupon.findFirst({
      where: {
        status: 'confirmed',
        booking_passenger_id: bookingPassengerId,
        flight_id: flightId,
        booking_passenger: { booking_id: bookingId, passenger: { deleted_at: null } },
      },
      select: { booking_passenger_id: true, passenger_id: true, flight_id: true },
    })

    if (!coupon) return null

    return { bookingPassengerId: coupon.booking_passenger_id, passengerId: coupon.passenger_id, flightId: coupon.flight_id }
  }

  /** The booking the requester belongs to, using the same checks as verifyPassenger (any flight). */
  private async findRequesterBookingId(input: { bookingReference: string; surname: string; passengerId: string }): Promise<string | null> {
    const reference = input.bookingReference?.trim().toUpperCase()
    const surname = input.surname?.trim()
    const passengerId = input.passengerId?.trim()

    if (!reference || !surname || !passengerId || !UUID_PATTERN.test(passengerId)) return null

    const coupon = await this.db.booking_coupon.findFirst({
      where: {
        status: 'confirmed',
        passenger_id: passengerId,
        booking_passenger: {
          booking: { booking_reference: reference },
          passenger: { last_name: { equals: surname, mode: 'insensitive' }, deleted_at: null },
        },
      },
      select: { booking_passenger: { select: { booking_id: true } } },
      orderBy: { created_at: 'asc' },
    })

    return coupon?.booking_passenger.booking_id ?? null
  }

  private async loadFlights(flightIds: string[]): Promise<VerifiedReportFlight[]> {
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
      flightId: flight.id,
      flightNumber: flight.flight_number,
      serviceDate: flight.service_date,
      origin: flight.route.origin,
      destination: flight.actual_destination ?? flight.route.destination,
    }))
  }
}
