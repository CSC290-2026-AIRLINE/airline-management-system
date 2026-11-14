import type { DbService } from '@backend/db/db.service'
import { DbBookings, DbFlights, DbPassengers, DbPricing, DbSettings } from './db-providers'
import { FixtureClock } from './fixture-providers'

// The generated Prisma client is ESM only: the providers under test never reach a real database.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const clock = new FixtureClock()

/** A coupon row as the booking query returns it: the booking, the passenger and the segment. */
const couponRow = (over: Record<string, unknown> = {}) => ({
  id: 'bc-1',
  booking_id: 'bk-1',
  booking_passenger_id: 'bp-1',
  flight_id: 'flt-fy204',
  passenger_id: 'pax-1',
  status: 'confirmed',
  booking_passenger: {
    id: 'bp-1',
    booking: { id: 'bk-1', booking_reference: 'PL224A', status: 'confirmed', customer: { user_id: 'u-1' } },
    passenger: { first_name: 'Narong', last_name: 'Sukjai', passport_number: 'TH1234567' },
    booking_service_request: [] as { service_code: string }[],
  },
  booking_segment: { cabin: 'economy', fare_class: { code: 'Y' } },
  ...over,
})

describe('DbBookings', () => {
  it('a held booking is not paid', async () => {
    const held = couponRow()
    held.booking_passenger.booking.status = 'held'
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([held]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    const [booking] = await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(booking.paid).toBe(false)
  })

  it('a confirmed booking and coupon are paid', async () => {
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([couponRow()]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    const [booking] = await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(booking).toMatchObject({
      paid: true,
      pnr: 'PL224A',
      flightId: 'flt-fy204',
      passengerId: 'pax-1',
      bookingPassengerId: 'bp-1',
      bookingId: 'bk-1',
      firstName: 'Narong',
      lastName: 'Sukjai',
      cabin: 'economy',
      fareClass: 'Y',
      customerUserId: 'u-1',
    })
  })

  it('the PNR is matched exactly and the surname case-insensitively', async () => {
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(db.booking_coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          booking_passenger: {
            booking: { booking_reference: 'PL224A' },
            passenger: { last_name: { equals: 'sukjai', mode: 'insensitive' } },
          },
        },
      }),
    )
  })

  it('the police mark comes from the passport number', async () => {
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([couponRow()]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    const [booking] = await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(booking.isPolice).toBe(true)
  })

  it('the special assistance codes come from the service requests of feature 3', async () => {
    const row = couponRow()
    row.booking_passenger.booking_service_request = [{ service_code: 'WCHR' }]
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([row]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    const [booking] = await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(booking.specialAssistance).toEqual(['WCHR'])
  })

  it('a passenger without a service request has no special assistance', async () => {
    const db = { booking_coupon: { findMany: jest.fn().mockResolvedValue([couponRow()]), findFirst: jest.fn() } }
    const bookings = new DbBookings(db as unknown as DbService)
    const [booking] = await bookings.findByPnrAndLastName('PL224A', 'sukjai')
    expect(booking.specialAssistance).toEqual([])
  })
})

describe('DbFlights', () => {
  const flightRow = {
    id: 'flt-fy204',
    flight_number: 'FY 204',
    service_date: new Date('2026-11-11T00:00:00.000Z'),
    dep_at: new Date('2026-11-11T03:25:00.000Z'),
    status: 'scheduled',
    route_id: 'rt-bkk-nrt',
    route: {
      airport_route_originToairport: { iata_code: 'BKK', city: 'Bangkok', country: 'TH' },
      airport_route_destinationToairport: { iata_code: 'NRT', city: 'Tokyo Narita', country: 'JP' },
    },
  }

  it('reads the flight, its route and both airports', async () => {
    const db = { flight: { findUnique: jest.fn().mockResolvedValue(flightRow), findMany: jest.fn().mockResolvedValue([flightRow]) } }
    const flights = new DbFlights(db as unknown as DbService)
    await expect(flights.byId('flt-fy204')).resolves.toEqual({
      id: 'flt-fy204',
      flightNumber: 'FY 204',
      serviceDate: '2026-11-11',
      depAt: new Date('2026-11-11T03:25:00.000Z'),
      status: 'scheduled',
      origin: { code: 'BKK', city: 'Bangkok', country: 'th' },
      destination: { code: 'NRT', city: 'Tokyo Narita', country: 'jp' },
      routeId: 'rt-bkk-nrt',
    })
    await expect(flights.list()).resolves.toHaveLength(1)
  })

  it('an unknown flight is null', async () => {
    const db = { flight: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn() } }
    await expect(new DbFlights(db as unknown as DbService).byId('nope')).resolves.toBeNull()
  })
})

describe('DbPricing', () => {
  it('route-specific baggage rate wins over the fare-class default', async () => {
    const db = {
      overweight_baggage_rate: {
        findMany: jest.fn().mockResolvedValue([
          { route_id: null, free_allowance_kg: 20, rate_per_kg: 500, max_bag_kg: null },
          { route_id: 'rt-1', free_allowance_kg: 25, rate_per_kg: 600, max_bag_kg: 30 },
        ]),
      },
      seat_fee: { findFirst: jest.fn() },
    }
    const pricing = new DbPricing(db as unknown as DbService)
    await expect(pricing.baggage('Y', 'rt-1')).resolves.toEqual({ freeKg: 25, ratePerKg: 600, maxBagKg: 30 })
    await expect(pricing.baggage('Y', 'rt-other')).resolves.toEqual({ freeKg: 20, ratePerKg: 500, maxBagKg: 32 })
  })

  it('a missing rate row falls back to the demo allowance instead of failing the view', async () => {
    const db = { overweight_baggage_rate: { findMany: jest.fn().mockResolvedValue([]) }, seat_fee: { findFirst: jest.fn() } }
    await expect(new DbPricing(db as unknown as DbService).baggage('Y', 'rt-1')).resolves.toEqual({
      freeKg: 20,
      ratePerKg: 500,
      maxBagKg: 32,
    })
  })

  it('a missing seat fee row is free', async () => {
    const db = { overweight_baggage_rate: { findMany: jest.fn() }, seat_fee: { findFirst: jest.fn().mockResolvedValue(null) } }
    await expect(new DbPricing(db as unknown as DbService).seatFee('economy', 'exit')).resolves.toBe(0)
  })

  it('the seat fee comes from the cabin and the seat type of feature 4', async () => {
    const db = {
      overweight_baggage_rate: { findMany: jest.fn() },
      seat_fee: { findFirst: jest.fn().mockResolvedValue({ amount: 450 }) },
    }
    const pricing = new DbPricing(db as unknown as DbService)
    await expect(pricing.seatFee('economy', 'exit')).resolves.toBe(450)
    expect(db.seat_fee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cabin: 'economy', seat_type: 'exit_row', deleted_at: null } }),
    )
    await pricing.seatFee('economy', 'front')
    expect(db.seat_fee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cabin: 'economy', seat_type: 'extra_legroom', deleted_at: null } }),
    )
  })
})

describe('DbSettings', () => {
  it('settings fall back to the spec defaults when a key is missing', async () => {
    const db = { check_in_setting: { findMany: jest.fn().mockResolvedValue([]) } }
    const settings = new DbSettings(db as unknown as DbService)
    await expect(settings.window()).resolves.toEqual({ checkInOpensHours: 24, checkInClosesMinutes: 60, boardingStartsMinutes: 40 })
    await expect(settings.checkedBagMaxLinearCm()).resolves.toBe(158)
    await expect(settings.bagTagAirlineNumber()).resolves.toBe('999')
  })

  it('the settings rows win over the defaults', async () => {
    const db = {
      check_in_setting: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'check_in_opens_hours', value: '48' },
          { key: 'check_in_closes_minutes', value: '90' },
          { key: 'boarding_starts_minutes', value: '30' },
          { key: 'checked_bag_max_linear_cm', value: '158' },
          { key: 'bag_tag_airline_number', value: '402' },
        ]),
      },
    }
    const settings = new DbSettings(db as unknown as DbService)
    await expect(settings.window()).resolves.toEqual({ checkInOpensHours: 48, checkInClosesMinutes: 90, boardingStartsMinutes: 30 })
    await expect(settings.bagTagAirlineNumber()).resolves.toBe('402')
  })

  it('the carry-on allowance of the cabin, the cabin rule without a row', async () => {
    const db = {
      carry_on_allowance: {
        findUnique: jest.fn().mockResolvedValue({ max_kg: 10, max_length_cm: 56, max_width_cm: 36, max_height_cm: 23 }),
      },
    }
    const settings = new DbSettings(db as unknown as DbService)
    await expect(settings.carryOn('business')).resolves.toEqual({ maxKg: 10, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 })
    db.carry_on_allowance.findUnique.mockResolvedValue(null)
    await expect(settings.carryOn('economy')).resolves.toEqual({ maxKg: 7, maxLengthCm: 56, maxWidthCm: 36, maxHeightCm: 23 })
  })

  it('no visa row means no visa is needed', async () => {
    const db = { visa_requirement: { findUnique: jest.fn().mockResolvedValue(null) } }
    await expect(new DbSettings(db as unknown as DbService).visaRequired('ut', 'kr')).resolves.toBe(false)
  })

  it('a visa row decides', async () => {
    const db = { visa_requirement: { findUnique: jest.fn().mockResolvedValue({ visa_required: true }) } }
    await expect(new DbSettings(db as unknown as DbService).visaRequired('ut', 'kr')).resolves.toBe(true)
  })
})

describe('DbPassengers', () => {
  const passengerRow = {
    id: 'pax-1',
    first_name: 'Anna',
    last_name: 'Eriksson',
    date_of_birth: null,
    gender: null,
    nationality: 'th',
    passport_number: null,
  }

  it('passenger fill writes only empty fields', async () => {
    const db = { passenger: { findFirst: jest.fn().mockResolvedValue(passengerRow), update: jest.fn() } }
    const passengers = new DbPassengers(db as unknown as DbService, clock)
    await passengers.fill('pax-1', { dateOfBirth: '1974-08-12', nationality: 'jp' })
    const data = db.passenger.update.mock.calls[0][0].data
    expect(data.date_of_birth).toEqual(new Date('1974-08-12T00:00:00.000Z'))
    expect(data.nationality).toBeUndefined()
    expect(data.updated_at).toBeInstanceOf(Date)
  })

  it('nothing to fill means no write', async () => {
    const db = { passenger: { findFirst: jest.fn().mockResolvedValue(passengerRow), update: jest.fn() } }
    await new DbPassengers(db as unknown as DbService, clock).fill('pax-1', { nationality: 'jp' })
    expect(db.passenger.update).not.toHaveBeenCalled()
  })

  it('reads a profile and finds it by passport number', async () => {
    const db = {
      passenger: {
        findFirst: jest.fn().mockResolvedValue({ ...passengerRow, date_of_birth: new Date('1974-08-12T00:00:00.000Z') }),
        findMany: jest.fn().mockResolvedValue([passengerRow]),
      },
    }
    const passengers = new DbPassengers(db as unknown as DbService, clock)
    await expect(passengers.byId('pax-1')).resolves.toEqual({
      id: 'pax-1',
      firstName: 'Anna',
      lastName: 'Eriksson',
      dateOfBirth: '1974-08-12',
      gender: null,
      nationality: 'th',
      passportNumber: null,
    })
    await expect(passengers.findByPassportNumber('TH1234567')).resolves.toHaveLength(1)
  })
})
