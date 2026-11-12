jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import type { DbService } from '@backend/db/db.service'
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { GuestBookingLookupService, normalizeGuestBookingAccess } from './guest-booking-lookup.service'
import { GuestLostReportFlightsController } from './guest-lost-report-flights.controller'

const FLIGHT_A = '00000000-0000-4000-8000-0000000000a1'
const FLIGHT_B = '00000000-0000-4000-8000-0000000000a2'
const FLIGHT_C = '00000000-0000-4000-8000-0000000000a3'
const FLIGHT_OTHER = '00000000-0000-4000-8000-0000000000a4'

interface Coupon {
  flight_id: string
  status: string
  booking_reference: string
  last_name: string
  passenger_deleted: boolean
  /** Fields a leaky implementation might pass through; they must never reach the response. */
  passenger_id: string
  booking_id: string
  first_name: string
  contact_email: string
}

const coupon = (overrides: Partial<Coupon>): Coupon => ({
  flight_id: FLIGHT_A,
  status: 'confirmed',
  booking_reference: 'K7QX2M',
  last_name: 'Eriksson',
  passenger_deleted: false,
  passenger_id: '00000000-0000-4000-8000-0000000000b1',
  booking_id: '00000000-0000-4000-8000-0000000000c1',
  first_name: 'Anna',
  contact_email: 'anna@example.com',
  ...overrides,
})

const FLIGHTS: Record<string, Record<string, unknown>> = {
  [FLIGHT_A]: {
    id: FLIGHT_A,
    flight_number: 'FY204',
    service_date: new Date('2026-10-19T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'BKK', destination: 'NRT' },
    aircraft_id: 'internal-aircraft',
  },
  [FLIGHT_B]: {
    id: FLIGHT_B,
    flight_number: 'FY311',
    service_date: new Date('2026-10-18T00:00:00Z'),
    actual_destination: 'CNX',
    route: { origin: 'BKK', destination: 'HKG' },
    aircraft_id: 'internal-aircraft',
  },
  [FLIGHT_C]: {
    id: FLIGHT_C,
    flight_number: 'FY900',
    service_date: new Date('2026-10-20T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'NRT', destination: 'BKK' },
    aircraft_id: 'internal-aircraft',
  },
  [FLIGHT_OTHER]: {
    id: FLIGHT_OTHER,
    flight_number: 'FY999',
    service_date: new Date('2026-10-21T00:00:00Z'),
    actual_destination: null,
    route: { origin: 'SIN', destination: 'BKK' },
    aircraft_id: 'internal-aircraft',
  },
}

type CouponWhere = {
  status: string
  booking_passenger: {
    booking: { booking_reference: string }
    passenger: { last_name: { equals: string; mode: string }; deleted_at: null }
  }
}

/** A fake that evaluates the service's coupon query the way the database would, over the fixture coupons. */
function makeService(coupons: Coupon[]) {
  const findCoupons = jest.fn(({ where }: { where: CouponWhere }) => {
    const { booking, passenger } = where.booking_passenger
    const hits = coupons.filter(
      (c) =>
        c.status === where.status &&
        c.booking_reference === booking.booking_reference &&
        c.last_name.toLowerCase() === passenger.last_name.equals.toLowerCase() &&
        !c.passenger_deleted,
    )
    // distinct on flight_id; return the whole fixture row to prove the service maps only what it needs.
    const unique = [...new Map(hits.map((c) => [c.flight_id, c])).values()]
    return Promise.resolve(unique)
  })
  const findFlights = jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(
      where.id.in
        .map((id) => FLIGHTS[id])
        .filter(Boolean)
        .sort(
          (a, b) =>
            (a.service_date as Date).getTime() - (b.service_date as Date).getTime() ||
            String(a.flight_number).localeCompare(String(b.flight_number)),
        ),
    ),
  )
  const db = { booking_coupon: { findMany: findCoupons }, flight: { findMany: findFlights } }
  return { service: new GuestBookingLookupService(db as unknown as DbService), findCoupons, findFlights }
}

const VERIFICATION_FAILED = { code: 'INVALID_REPORT', message: 'Booking verification failed' }

describe('GuestBookingLookupService', () => {
  it('lists the confirmed flights for a matching booking reference and surname', async () => {
    const { service } = makeService([coupon({ flight_id: FLIGHT_A }), coupon({ flight_id: FLIGHT_B })])

    await expect(service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'Eriksson' })).resolves.toEqual([
      { flightNumber: 'FY311', serviceDate: '2026-10-18', origin: 'BKK', destination: 'CNX' },
      { flightNumber: 'FY204', serviceDate: '2026-10-19', origin: 'BKK', destination: 'NRT' },
    ])
  })

  it('trims and upper-cases the reference and matches the surname case-insensitively, as the signed-in lookup does', async () => {
    const { service, findCoupons } = makeService([coupon({})])

    await expect(service.listEligibleFlights({ bookingReference: ' k7qx2m ', surname: '  ERIKSSON ' })).resolves.toHaveLength(1)
    expect(findCoupons).toHaveBeenCalledWith({
      where: {
        status: 'confirmed',
        booking_passenger: {
          booking: { booking_reference: 'K7QX2M' },
          passenger: { last_name: { equals: 'ERIKSSON', mode: 'insensitive' }, deleted_at: null },
        },
      },
      select: { flight_id: true },
      distinct: ['flight_id'],
    })
  })

  it('excludes flights whose coupon is not confirmed, and passengers who were deleted', async () => {
    const { service } = makeService([
      coupon({ flight_id: FLIGHT_A }),
      coupon({ flight_id: FLIGHT_B, status: 'cancelled' }),
      coupon({ flight_id: FLIGHT_C, passenger_deleted: true }),
    ])

    const flights = await service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'Eriksson' })

    expect(flights.map((f) => f.flightNumber)).toEqual(['FY204'])
  })

  it('never lists flights from another booking or another surname on the same booking', async () => {
    const { service } = makeService([
      coupon({ flight_id: FLIGHT_A }),
      coupon({ flight_id: FLIGHT_OTHER, booking_reference: 'ZZZZZ9' }),
      coupon({ flight_id: FLIGHT_C, last_name: 'Becker' }),
    ])

    const flights = await service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'Eriksson' })

    expect(flights.map((f) => f.flightNumber)).toEqual(['FY204'])
  })

  it('does not reject a booking because several passengers share the surname; their flights are listed together once each', async () => {
    const { service } = makeService([
      coupon({ flight_id: FLIGHT_A, passenger_id: 'p-anna', first_name: 'Anna' }),
      coupon({ flight_id: FLIGHT_A, passenger_id: 'p-erik', first_name: 'Erik' }),
      coupon({ flight_id: FLIGHT_C, passenger_id: 'p-erik', first_name: 'Erik' }),
    ])

    const flights = await service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'eriksson' })

    expect(flights.map((f) => f.flightNumber)).toEqual(['FY204', 'FY900'])
  })

  it('returns only flight number, date, origin and destination: no ids, names or contact details', async () => {
    const { service } = makeService([coupon({ flight_id: FLIGHT_A })])

    const [flight] = await service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'Eriksson' })

    expect(Object.keys(flight).sort()).toEqual(['destination', 'flightNumber', 'origin', 'serviceDate'])
    const serialized = JSON.stringify(flight)
    for (const leaked of [FLIGHT_A, 'p-', '0000000000b1', '0000000000c1', 'Anna', 'Eriksson', 'anna@example.com', 'internal-aircraft']) {
      expect(serialized).not.toContain(leaked)
    }
  })

  it.each([
    ['an unknown booking reference', { bookingReference: 'NOPE00', surname: 'Eriksson' }],
    ['a surname not on the booking', { bookingReference: 'K7QX2M', surname: 'Smith' }],
    ['a reference of the wrong length', { bookingReference: 'K7QX2', surname: 'Eriksson' }],
    ['a reference with symbols', { bookingReference: 'K7-X2M', surname: 'Eriksson' }],
    ['an empty surname', { bookingReference: 'K7QX2M', surname: '   ' }],
    ['a surname over 100 characters', { bookingReference: 'K7QX2M', surname: 'x'.repeat(101) }],
    ['a missing surname', { bookingReference: 'K7QX2M' }],
    ['non-string values', { bookingReference: ['K7QX2M'], surname: 42 }],
    ['no body', undefined],
    ['an array body', [{ bookingReference: 'K7QX2M', surname: 'Eriksson' }]],
  ])('answers %s with the same uniform failure and no data', async (_label, body) => {
    const { service } = makeService([coupon({})])

    await expect(service.listEligibleFlights(body)).rejects.toMatchObject(VERIFICATION_FAILED)
  })

  it('does not query the database at all for malformed input', async () => {
    const { service, findCoupons, findFlights } = makeService([coupon({})])

    await expect(service.listEligibleFlights({ bookingReference: 'bad', surname: 'Eriksson' })).rejects.toMatchObject(VERIFICATION_FAILED)
    expect(findCoupons).not.toHaveBeenCalled()
    expect(findFlights).not.toHaveBeenCalled()
  })

  it('fails uniformly when the booking matches but has no confirmed flight (no hint that it exists)', async () => {
    const { service, findFlights } = makeService([coupon({ status: 'cancelled' })])

    await expect(service.listEligibleFlights({ bookingReference: 'K7QX2M', surname: 'Eriksson' })).rejects.toMatchObject(
      VERIFICATION_FAILED,
    )
    expect(findFlights).not.toHaveBeenCalled()
  })
})

describe('normalizeGuestBookingAccess', () => {
  it('returns the normalized access or null', () => {
    expect(normalizeGuestBookingAccess({ bookingReference: ' p4lm8t ', surname: ' Prasert ', extra: 'ignored' })).toEqual({
      bookingReference: 'P4LM8T',
      surname: 'Prasert',
    })
    expect(normalizeGuestBookingAccess(null)).toBeNull()
    expect(normalizeGuestBookingAccess('K7QX2M')).toBeNull()
  })
})

describe('GuestLostReportFlightsController', () => {
  it('is a public POST /guest/lost-report-flights answering 200, with no customer guard', () => {
    const handler = Object.getOwnPropertyDescriptor(GuestLostReportFlightsController.prototype, 'list')!.value as object

    expect(Reflect.getMetadata(IS_PUBLIC_KEY, GuestLostReportFlightsController)).toBe(true)
    expect(Reflect.getMetadata(PATH_METADATA, GuestLostReportFlightsController)).toBe('guest/lost-report-flights')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200)
    expect(Reflect.getMetadata(GUARDS_METADATA, GuestLostReportFlightsController)).toBeUndefined()
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined()
  })

  it('passes the raw body to the lookup service and returns its result', async () => {
    const lookup = { listEligibleFlights: jest.fn().mockResolvedValue([{ flightNumber: 'FY204' }]) }
    const controller = new GuestLostReportFlightsController(lookup as never)
    const body = { bookingReference: 'K7QX2M', surname: 'Eriksson' }

    await expect(controller.list(body)).resolves.toEqual([{ flightNumber: 'FY204' }])
    expect(lookup.listEligibleFlights).toHaveBeenCalledWith(body)
  })
})
