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
