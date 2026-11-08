import { Inject, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { Cabin, CarryOnAllowance } from '../api-types'
import { DEFAULT_WINDOW_SETTINGS } from '../domain/window'
import type { WindowSettings } from '../domain/window'
import type { Numeric } from '../store/prisma-mappers'
import { fromIsoDate, toIsoDate } from '../store/prisma-mappers'
import { POLICE_PASSPORTS, SETTINGS } from './fixtures'
import { CLOCK } from './providers'
import type {
  BookingPassenger,
  BookingProvider,
  ClockProvider,
  FlightProvider,
  FlightRecord,
  PassengerProfile,
  PassengerProfileProvider,
  PricingProvider,
  SettingsProvider,
} from './providers'

/** The cabins of the booking; a booking that carries another name is treated as economy. */
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const toCabin = (value: string): Cabin => (CABINS.includes(value as Cabin) ? (value as Cabin) : 'economy')

interface AirportRow {
  iata_code: string
  city: string
  country: string
}

interface FlightRow {
  id: string
  flight_number: string
  service_date: Date
  dep_at: Date
  status: string
  route_id: string
  route: {
    airport_route_originToairport: AirportRow | null
    airport_route_destinationToairport: AirportRow | null
  }
}

const airportOf = (row: AirportRow | null) => ({
  code: row?.iata_code ?? '',
  city: row?.city ?? '',
  country: (row?.country ?? '').toLowerCase(),
})

const toFlightRecord = (row: FlightRow): FlightRecord => ({
  id: row.id,
  flightNumber: row.flight_number,
  serviceDate: toIsoDate(row.service_date),
  depAt: row.dep_at,
  status: row.status as FlightRecord['status'],
  origin: airportOf(row.route.airport_route_originToairport),
  destination: airportOf(row.route.airport_route_destinationToairport),
  routeId: row.route_id,
})

/** The route of a flight carries both airports; the demo reads them through the route. */
const ROUTE_AIRPORTS = { airport_route_originToairport: true, airport_route_destinationToairport: true } as const

/** Feature 2 owns the flights: the route, its airports and the departure are read from the database. */
@Injectable()
export class DbFlights implements FlightProvider {
  constructor(private readonly db: DbService) {}

  async byId(id: string): Promise<FlightRecord | null> {
    const row = await this.db.flight.findUnique({ where: { id }, include: { route: { include: ROUTE_AIRPORTS } } })
    return row ? toFlightRecord(row) : null
  }

  async list(): Promise<FlightRecord[]> {
    const rows = await this.db.flight.findMany({ include: { route: { include: ROUTE_AIRPORTS } }, orderBy: { dep_at: 'asc' } })
    return rows.map(toFlightRecord)
  }
}

interface CouponRow {
  id: string
  booking_passenger_id: string
  flight_id: string
  passenger_id: string
  status: string
  booking_passenger: {
    booking: { id: string; booking_reference: string; status: string; customer: { user_id: string } }
    passenger: { first_name: string; last_name: string; passport_number: string | null }
  }
  booking_segment: { cabin: string; fare_class: { code: string } | null }
}

/** The coupon of a booking passenger: the booking, the passenger and the segment behind it. */
const COUPON_INCLUDE = {
  booking_passenger: {
    include: {
      booking: { include: { customer: { select: { user_id: true } } } },
      passenger: { select: { first_name: true, last_name: true, passport_number: true } },
    },
  },
  booking_segment: { include: { fare_class: { select: { code: true } } } },
} as const

/** Feature 3 owns the bookings; feature 6 reads the passenger behind a PNR. */
@Injectable()
export class DbBookings implements BookingProvider {
  constructor(private readonly db: DbService) {}

  async findByPnrAndLastName(pnr: string, lastName: string): Promise<BookingPassenger[]> {
    const rows = await this.db.booking_coupon.findMany({
      where: {
        booking_passenger: {
          booking: { booking_reference: pnr.trim() },
          passenger: { last_name: { equals: lastName.trim(), mode: 'insensitive' } },
        },
      },
      include: COUPON_INCLUDE,
      orderBy: { created_at: 'asc' },
    })
    return rows.map(toBookingPassenger)
  }

  async byBookingPassengerId(id: string): Promise<BookingPassenger | null> {
    // shortcut: a booking passenger with several flights answers with its first coupon.
    const row = await this.db.booking_coupon.findFirst({
      where: { booking_passenger_id: id },
      include: COUPON_INCLUDE,
      orderBy: { created_at: 'asc' },
    })
    return row ? toBookingPassenger(row) : null
  }

  async listByFlight(flightId: string): Promise<BookingPassenger[]> {
    const rows = await this.db.booking_coupon.findMany({
      where: { flight_id: flightId },
      include: COUPON_INCLUDE,
      orderBy: { created_at: 'asc' },
    })
    return rows.map(toBookingPassenger)
  }
}

const toBookingPassenger = (row: CouponRow): BookingPassenger => {
  const booking = row.booking_passenger.booking
  const passenger = row.booking_passenger.passenger
  return {
    bookingPassengerId: row.booking_passenger_id,
    pnr: booking.booking_reference,
    paid: booking.status === 'confirmed' && row.status === 'confirmed',
    bookingId: booking.id,
    flightId: row.flight_id,
    passengerId: row.passenger_id,
    firstName: passenger.first_name,
    lastName: passenger.last_name,
    cabin: toCabin(row.booking_segment.cabin),
    fareClass: row.booking_segment.fare_class?.code ?? '',
    // shortcut: feature 3 has no special assistance table yet, so nobody is marked.
    specialAssistance: [],
    // shortcut: feature 8 has no air marshal service, the demo passports stand in for it.
    isPolice: passenger.passport_number !== null && POLICE_PASSPORTS.includes(passenger.passport_number),
    customerUserId: booking.customer.user_id,
  }
}

interface PassengerRow {
  id: string
  first_name: string
  last_name: string
  date_of_birth: Date | null
  gender: string | null
  nationality: string | null
  passport_number: string | null
}

const toPassengerProfile = (row: PassengerRow): PassengerProfile => ({
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  dateOfBirth: row.date_of_birth ? toIsoDate(row.date_of_birth) : null,
  gender: row.gender,
  nationality: row.nationality,
  passportNumber: row.passport_number,
})

/** Feature 7 owns the passenger profile: feature 6 fills the empty fields and never overwrites one. */
@Injectable()
export class DbPassengers implements PassengerProfileProvider {
  constructor(
    private readonly db: DbService,
    @Inject(CLOCK) private readonly clock: ClockProvider,
  ) {}

  async byId(id: string): Promise<PassengerProfile | null> {
    const row = await this.db.passenger.findFirst({ where: { id, deleted_at: null } })
    return row ? toPassengerProfile(row) : null
  }

  async findByPassportNumber(n: string): Promise<PassengerProfile[]> {
    const rows = await this.db.passenger.findMany({ where: { passport_number: n, deleted_at: null } })
    return rows.map(toPassengerProfile)
  }

  /** Fills empty fields only: a difference is flagged for staff, never written over. */
  async fill(id: string, fields: Partial<Omit<PassengerProfile, 'id' | 'firstName' | 'lastName'>>): Promise<void> {
    const row = await this.db.passenger.findFirst({ where: { id, deleted_at: null } })
    if (!row) return
    const data: Record<string, unknown> = {}
    if (row.date_of_birth === null && fields.dateOfBirth) data.date_of_birth = fromIsoDate(fields.dateOfBirth)
    if (row.gender === null && fields.gender) data.gender = fields.gender
    if (row.nationality === null && fields.nationality) data.nationality = fields.nationality
    if (row.passport_number === null && fields.passportNumber) data.passport_number = fields.passportNumber
    if (Object.keys(data).length === 0) return
    data.updated_at = this.clock.now()
    await this.db.passenger.update({ where: { id }, data })
  }

  async customerByUserId(userId: string): Promise<{ passengerId: string | null } | null> {
    const row = await this.db.customer.findUnique({ where: { user_id: userId }, select: { passenger_id: true } })
    return row ? { passengerId: row.passenger_id } : null
  }
}

interface BaggageRateRow {
  route_id: string | null
  free_allowance_kg: Numeric
  rate_per_kg: Numeric
  max_bag_kg: Numeric | null
}

/** Feature 4 owns the allowance and the seat fees. */
@Injectable()
export class DbPricing implements PricingProvider {
  constructor(private readonly db: DbService) {}

  async baggage(fareClass: string, routeId: string): Promise<{ freeKg: number; ratePerKg: number; maxBagKg: number }> {
    const rows = await this.db.overweight_baggage_rate.findMany({
      where: { fare_class: { code: fareClass }, is_active: true, deleted_at: null },
    })
    const row =
      (rows as BaggageRateRow[]).find((r) => r.route_id === routeId) ?? (rows as BaggageRateRow[]).find((r) => r.route_id === null)
    if (!row) {
      // shortcut: feature 4 has no rate row for this fare class, the demo allowance stands until it seeds one.
      return { freeKg: 20, ratePerKg: 500, maxBagKg: 32 }
    }
    return {
      freeKg: Number(row.free_allowance_kg),
      ratePerKg: Number(row.rate_per_kg),
      maxBagKg: row.max_bag_kg === null ? 32 : Number(row.max_bag_kg),
    }
  }

  async seatFee(cabin: Cabin, type: string): Promise<number> {
    const row = await this.db.seat_fee.findFirst({ where: { cabin, seat_type: type, deleted_at: null } })
    return row ? Number(row.amount) : 0
  }
}

/** Feature 6 owns the check-in settings; the spec defaults are the fallback of every missing key. */
@Injectable()
export class DbSettings implements SettingsProvider {
  constructor(private readonly db: DbService) {}

  async window(): Promise<WindowSettings> {
    const values = await this.values()
    return {
      checkInOpensHours: this.number(values.get('check_in_opens_hours'), DEFAULT_WINDOW_SETTINGS.checkInOpensHours),
      checkInClosesMinutes: this.number(values.get('check_in_closes_minutes'), DEFAULT_WINDOW_SETTINGS.checkInClosesMinutes),
      boardingStartsMinutes: this.number(values.get('boarding_starts_minutes'), DEFAULT_WINDOW_SETTINGS.boardingStartsMinutes),
    }
  }

  async checkedBagMaxLinearCm(): Promise<number> {
    return this.number((await this.values()).get('checked_bag_max_linear_cm'), 158)
  }

  async bagTagAirlineNumber(): Promise<string> {
    return (await this.values()).get('bag_tag_airline_number') ?? '999'
  }

  async carryOn(cabin: Cabin): Promise<CarryOnAllowance> {
    const row = await this.db.carry_on_allowance.findUnique({ where: { cabin } })
    if (!row) return { ...SETTINGS.carryOn }
    return {
      maxKg: Number(row.max_kg),
      maxLengthCm: row.max_length_cm,
      maxWidthCm: row.max_width_cm,
      maxHeightCm: row.max_height_cm,
    }
  }

  async visaRequired(nationality2: string, destinationCountry2: string): Promise<boolean> {
    const row = await this.db.visa_requirement.findUnique({
      where: { nationality_destination_country: { nationality: nationality2, destination_country: destinationCountry2 } },
    })
    return row?.visa_required ?? false
  }

  private async values(): Promise<Map<string, string>> {
    const rows = await this.db.check_in_setting.findMany()
    return new Map(rows.map((row) => [row.key, row.value]))
  }

  private number(value: string | undefined, fallback: number): number {
    const parsed = value === undefined ? Number.NaN : Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
}
