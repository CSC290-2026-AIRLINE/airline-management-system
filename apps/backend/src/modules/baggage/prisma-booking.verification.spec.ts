jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

import type { DbService } from '@backend/db/db.service'
import { PrismaBookingVerification } from './prisma-booking.verification'

const PASSENGER_ID = '11111111-1111-4111-8111-111111111111'

function flightRow(id: string) {
  return {
    id,
    flight_number: 'FY 117',
    service_date: new Date('2026-10-18T00:00:00.000Z'),
    actual_destination: null,
    route: { origin: 'BKK', destination: 'SIN' },
  }
}

describe('PrismaBookingVerification.listConfirmedFlights', () => {
  let findCoupons: jest.Mock
  let findFlights: jest.Mock
  let verification: PrismaBookingVerification

  beforeEach(() => {
    findCoupons = jest.fn().mockResolvedValue([{ flight_id: '22222222-2222-4222-8222-222222222222' }])
    findFlights = jest.fn().mockResolvedValue([flightRow('22222222-2222-4222-8222-222222222222')])
    const db = { booking_coupon: { findMany: findCoupons }, flight: { findMany: findFlights } } as unknown as DbService
    verification = new PrismaBookingVerification(db)
  })

  it('returns only the requested passenger booking flight fields', async () => {
    const flights = await verification.listConfirmedFlights({
      bookingReference: 'abc123',
      surname: 'Smith',
      passengerId: PASSENGER_ID,
    })

    expect(flights).toEqual([
      {
        flightId: '22222222-2222-4222-8222-222222222222',
        flightNumber: 'FY 117',
        serviceDate: new Date('2026-10-18T00:00:00.000Z'),
        origin: 'BKK',
        destination: 'SIN',
      },
    ])
    expect(Object.keys(flights[0])).toEqual(['flightId', 'flightNumber', 'serviceDate', 'origin', 'destination'])
    expect(findFlights).toHaveBeenCalledWith({
      where: { id: { in: ['22222222-2222-4222-8222-222222222222'] } },
      select: {
        id: true,
        flight_number: true,
        service_date: true,
        actual_destination: true,
        route: { select: { origin: true, destination: true } },
      },
      orderBy: [{ service_date: 'asc' }, { flight_number: 'asc' }],
    })
  })

  it('filters by confirmed coupon, authenticated passenger, booking reference, and case-insensitive surname', async () => {
    await verification.listConfirmedFlights({
      bookingReference: ' ABC123 ',
      surname: 'sMiTh',
      passengerId: PASSENGER_ID,
    })

    expect(findCoupons).toHaveBeenCalledWith({
      where: {
        status: 'confirmed',
        passenger_id: PASSENGER_ID,
        booking_passenger: {
          booking: { booking_reference: 'ABC123' },
          passenger: {
            last_name: { equals: 'sMiTh', mode: 'insensitive' },
            deleted_at: null,
          },
        },
      },
      select: { flight_id: true },
      distinct: ['flight_id'],
    })
  })

  it.each([
    { bookingReference: 'WRONG1', surname: 'Smith', passengerId: PASSENGER_ID },
    { bookingReference: 'ABC123', surname: 'Wrong', passengerId: PASSENGER_ID },
  ])('returns no matching flight for invalid booking access %#', async (input) => {
    findCoupons.mockResolvedValueOnce([])

    await expect(verification.listConfirmedFlights(input)).resolves.toEqual([])
    expect(findCoupons.mock.calls[0][0].where.booking_passenger).toMatchObject({
      booking: { booking_reference: input.bookingReference },
      passenger: { last_name: { equals: input.surname, mode: 'insensitive' } },
    })
  })

  it('filters another passenger booking by the authenticated passenger ID', async () => {
    const otherPassengerId = '77777777-7777-4777-8777-777777777777'

    await verification.listConfirmedFlights({ bookingReference: 'ABC123', surname: 'Smith', passengerId: otherPassengerId })

    expect(findCoupons.mock.calls[0][0].where.passenger_id).toBe(otherPassengerId)
  })

  it.each(['held', 'cancelled', 'expired'])('excludes %s coupons', async () => {
    await verification.listConfirmedFlights({
      bookingReference: 'ABC123',
      surname: 'Smith',
      passengerId: PASSENGER_ID,
    })

    expect(findCoupons.mock.calls[0][0].where.status).toBe('confirmed')
  })

  it('returns no flights for an invalid or missing passenger ID without querying bookings', async () => {
    await expect(
      verification.listConfirmedFlights({ bookingReference: 'ABC123', surname: 'Smith', passengerId: 'not-a-uuid' }),
    ).resolves.toEqual([])
    expect(findCoupons).not.toHaveBeenCalled()
    expect(findFlights).not.toHaveBeenCalled()
  })
})

const BOOKING_ID = '77777777-7777-4777-8777-777777777777'
const OWN_BP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CO_BP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CO_PASSENGER_ID = '88888888-8888-4888-8888-888888888888'
const FLIGHT_A = '22222222-2222-4222-8222-222222222222'
const FLIGHT_B = '33333333-3333-4333-8333-333333333333'

function travellerCoupon(bookingPassengerId: string, passengerId: string, flightId: string, firstName: string, lastName: string) {
  return {
    booking_passenger_id: bookingPassengerId,
    flight_id: flightId,
    booking_passenger: { passenger_id: passengerId, passenger: { first_name: firstName, last_name: lastName } },
  }
}

describe('PrismaBookingVerification.listEligibleTravellers', () => {
  let findFirstCoupon: jest.Mock
  let findCoupons: jest.Mock
  let findFlights: jest.Mock
  let verification: PrismaBookingVerification
  const access = { bookingReference: 'k7qx2m', surname: ' Eriksson ', passengerId: PASSENGER_ID }

  beforeEach(() => {
    findFirstCoupon = jest.fn().mockResolvedValue({ booking_passenger: { booking_id: BOOKING_ID } })
    findCoupons = jest
      .fn()
      .mockResolvedValue([
        travellerCoupon(CO_BP, CO_PASSENGER_ID, FLIGHT_A, 'Erik', 'Eriksson'),
        travellerCoupon(OWN_BP, PASSENGER_ID, FLIGHT_B, 'Anna', 'Eriksson'),
        travellerCoupon(OWN_BP, PASSENGER_ID, FLIGHT_A, 'Anna', 'Eriksson'),
      ])
    findFlights = jest
      .fn()
      .mockResolvedValue([flightRow(FLIGHT_A), { ...flightRow(FLIGHT_B), service_date: new Date('2026-10-20T00:00:00.000Z') }])
    const db = {
      booking_coupon: { findFirst: findFirstCoupon, findMany: findCoupons },
      flight: { findMany: findFlights },
    } as unknown as DbService
    verification = new PrismaBookingVerification(db)
  })

  it('verifies the requester on the booking with the same reference, surname and confirmed-coupon checks', async () => {
    await verification.listEligibleTravellers(access)

    expect(findFirstCoupon).toHaveBeenCalledWith({
      where: {
        status: 'confirmed',
        passenger_id: PASSENGER_ID,
        booking_passenger: {
          booking: { booking_reference: 'K7QX2M' },
          passenger: { last_name: { equals: 'Eriksson', mode: 'insensitive' }, deleted_at: null },
        },
      },
      select: { booking_passenger: { select: { booking_id: true } } },
      orderBy: { created_at: 'asc' },
    })
  })

  it('lists only confirmed travellers on the verified booking', async () => {
    await verification.listEligibleTravellers(access)

    expect(findCoupons.mock.calls[0][0].where).toEqual({
      status: 'confirmed',
      booking_passenger: { booking_id: BOOKING_ID, passenger: { deleted_at: null } },
    })
  })

  it('returns only id, display name, isYou and flights, with the requester first and flights in date order', async () => {
    const travellers = await verification.listEligibleTravellers(access)

    expect(travellers.map(({ bookingPassengerId, displayName, isYou }) => ({ bookingPassengerId, displayName, isYou }))).toEqual([
      { bookingPassengerId: OWN_BP, displayName: 'Anna Eriksson', isYou: true },
      { bookingPassengerId: CO_BP, displayName: 'Erik Eriksson', isYou: false },
    ])
    for (const traveller of travellers) expect(Object.keys(traveller)).toEqual(['bookingPassengerId', 'displayName', 'isYou', 'flights'])
    expect(travellers[0].flights.map(({ flightId }) => flightId)).toEqual([FLIGHT_A, FLIGHT_B])
    expect(travellers[1].flights.map(({ flightId }) => flightId)).toEqual([FLIGHT_A])
    expect(Object.keys(travellers[0].flights[0])).toEqual(['flightId', 'flightNumber', 'serviceDate', 'origin', 'destination'])
  })

  it('returns nothing and never reads travellers when the requester does not verify', async () => {
    findFirstCoupon.mockResolvedValue(null)

    await expect(verification.listEligibleTravellers(access)).resolves.toEqual([])
    expect(findCoupons).not.toHaveBeenCalled()
    expect(findFlights).not.toHaveBeenCalled()
  })

  it('returns nothing for an invalid passenger ID without querying bookings', async () => {
    await expect(verification.listEligibleTravellers({ ...access, passengerId: 'not-a-uuid' })).resolves.toEqual([])
    expect(findFirstCoupon).not.toHaveBeenCalled()
  })
})

describe('PrismaBookingVerification.resolveTraveller', () => {
  let findFirstCoupon: jest.Mock
  let verification: PrismaBookingVerification
  const input = {
    bookingReference: 'K7QX2M',
    surname: 'Eriksson',
    passengerId: PASSENGER_ID,
    bookingPassengerId: CO_BP,
    flightId: FLIGHT_A,
  }

  beforeEach(() => {
    findFirstCoupon = jest
      .fn()
      .mockResolvedValueOnce({ booking_passenger: { booking_id: BOOKING_ID } })
      .mockResolvedValueOnce({ booking_passenger_id: CO_BP, passenger_id: CO_PASSENGER_ID, flight_id: FLIGHT_A })
    const db = { booking_coupon: { findFirst: findFirstCoupon } } as unknown as DbService
    verification = new PrismaBookingVerification(db)
  })

  it('resolves a traveller on the requester own booking with a confirmed coupon for the flight', async () => {
    await expect(verification.resolveTraveller(input)).resolves.toEqual({
      bookingPassengerId: CO_BP,
      passengerId: CO_PASSENGER_ID,
      flightId: FLIGHT_A,
    })
    expect(findFirstCoupon.mock.calls[1][0].where).toEqual({
      status: 'confirmed',
      booking_passenger_id: CO_BP,
      flight_id: FLIGHT_A,
      booking_passenger: { booking_id: BOOKING_ID, passenger: { deleted_at: null } },
    })
  })

  it('rejects a traveller from an unrelated booking (no coupon on the requester booking)', async () => {
    findFirstCoupon.mockReset()
    findFirstCoupon.mockResolvedValueOnce({ booking_passenger: { booking_id: BOOKING_ID } }).mockResolvedValueOnce(null)

    await expect(
      verification.resolveTraveller({ ...input, bookingPassengerId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    ).resolves.toBeNull()
  })

  it('rejects when the requester does not verify, without looking up the traveller', async () => {
    findFirstCoupon.mockReset()
    findFirstCoupon.mockResolvedValue(null)

    await expect(verification.resolveTraveller(input)).resolves.toBeNull()
    expect(findFirstCoupon).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed traveller or flight IDs without querying', async () => {
    await expect(verification.resolveTraveller({ ...input, bookingPassengerId: 'x' })).resolves.toBeNull()
    await expect(verification.resolveTraveller({ ...input, flightId: '' })).resolves.toBeNull()
    expect(findFirstCoupon).not.toHaveBeenCalled()
  })
})
