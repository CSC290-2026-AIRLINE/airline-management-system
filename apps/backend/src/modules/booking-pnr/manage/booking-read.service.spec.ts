import { NotFoundException } from '@nestjs/common'
import { BookingReadService } from './booking-read.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-08T10:00:00Z')

function makeHarness() {
  const db = {
    booking: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    booking_passenger: { findUnique: jest.fn() },
    booking_coupon: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    booking_service_request: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    user: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn() },
  }
  const clock = { now: () => NOW }
  const service = new BookingReadService(db as never, clock)
  return { db, clock, service }
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    booking_reference: 'ABC123',
    status: 'confirmed',
    trip_type: 'one_way',
    payment_type: 'cash',
    customer_id: 'customer-1',
    booked_by_staff_id: null,
    contact_email: 'somchai@example.com',
    contact_phone: '+66000000000',
    currency: 'USD',
    booked_at: new Date('2026-11-01T00:00:00Z'),
    hold_expires_at: new Date('2026-11-01T00:15:00Z'),
    confirmed_at: new Date('2026-11-01T00:05:00Z'),
    cancelled_at: null,
    ...overrides,
  }
}

function listPassenger(id: string, type: string, firstName: string, lastName: string, createdAt: Date) {
  return {
    id,
    passenger_id: `p-${id}`,
    passenger_type: type,
    created_at: createdAt,
    passenger: { first_name: firstName, last_name: lastName },
  }
}

function detailPassenger(id: string, type: string, firstName: string, lastName: string, createdAt: Date, lapOfId: string | null) {
  return { ...listPassenger(id, type, firstName, lastName, createdAt), lap_of_id: lapOfId }
}

function detailSegment(segmentOrder: number, origin: string, destination: string, depAt: Date) {
  return {
    id: `seg-${segmentOrder}`,
    flight_id: `flight-${segmentOrder}`,
    segment_order: segmentOrder,
    cabin: 'economy',
    fare_class_id: 'fare-1',
    fare_class: { code: 'Y' },
    seat_inventory: {
      flight: {
        flight_number: `FL${segmentOrder}`,
        dep_at: depAt,
        arr_at: new Date(depAt.getTime() + 2 * 60 * 60 * 1000),
        route: { origin, destination },
      },
    },
  }
}

function listSegment(segmentOrder: number, origin: string, destination: string, depAt: Date) {
  const segment = detailSegment(segmentOrder, origin, destination, depAt)
  return {
    id: segment.id,
    segment_order: segment.segment_order,
    seat_inventory: segment.seat_inventory,
  }
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryRow(),
    booking_passenger: [
      detailPassenger('bp-2', 'adult', 'Somchai', 'Wongchai', new Date('2026-11-01T00:00:00Z'), null),
      detailPassenger('bp-1', 'infant', 'Mia', 'Wongchai', new Date('2026-11-01T00:01:00Z'), 'bp-2'),
    ],
    booking_segment: [detailSegment(1, 'BKK', 'NRT', new Date('2026-11-10T02:00:00Z'))],
    ...overrides,
  }
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    ...summaryRow(),
    booking_passenger: [
      listPassenger('bp-2', 'adult', 'Somchai', 'Wongchai', new Date('2026-11-01T00:00:00Z')),
      listPassenger('bp-1', 'child', 'Mia', 'Wongchai', new Date('2026-11-01T00:01:00Z')),
    ],
    booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-10T02:00:00Z'))],
    ...overrides,
  }
}

function couponDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'coupon-1',
    booking_passenger_id: 'bp-2',
    passenger_id: 'p-bp-2',
    booking_segment_id: 'seg-1',
    flight_id: 'flight-1',
    ticket_number: '2174400123456',
    status: 'confirmed',
    cancel_reason: null,
    price_total: '148.50',
    seat_assignment: [
      { seat_code: '12A', status: 'held' },
      { seat_code: '12B', status: 'assigned' },
    ],
    ...overrides,
  }
}

function serviceRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    booking_passenger_id: 'bp-2',
    booking_segment_id: 'seg-1',
    service_code: 'WCHR',
    status: 'requested',
    note: 'Needs help',
    decision_note: null,
    requested_at: new Date('2026-11-01T00:06:00Z'),
    ...overrides,
  }
}

describe('BookingReadService detail reads', () => {
  it('maps a booking detail with live flight data, seats, totals and history', async () => {
    const h = makeHarness()
    h.db.booking.findUnique.mockResolvedValue(detailRow())
    h.db.booking_coupon.findMany.mockResolvedValue([
      couponDetail(),
      couponDetail({ id: 'coupon-2', booking_passenger_id: 'bp-1', passenger_id: 'p-bp-1', price_total: '0.00', seat_assignment: [] }),
    ])
    h.db.booking_service_request.findMany.mockResolvedValue([serviceRequest()])

    const detail = await h.service.getBooking('ABC123')

    expect(h.db.booking.findUnique).toHaveBeenCalledWith({
      where: { booking_reference: 'ABC123' },
      select: expect.anything(),
    })
    expect(detail).toMatchObject({
      bookingId: 'booking-1',
      reference: 'ABC123',
      status: 'confirmed',
      customerId: 'customer-1',
      total: 148.5,
      serverNow: NOW,
    })
    expect(detail?.passengers).toEqual([
      expect.objectContaining({ bookingPassengerId: 'bp-2', firstName: 'Somchai', lastName: 'Wongchai' }),
      expect.objectContaining({ bookingPassengerId: 'bp-1', lapOfBookingPassengerId: 'bp-2' }),
    ])
    expect(detail?.segments).toEqual([
      expect.objectContaining({ flightId: 'flight-1', flightNumber: 'FL1', origin: 'BKK', destination: 'NRT', fareClassCode: 'Y' }),
    ])
    expect(detail?.coupons[0]).toMatchObject({ couponId: 'coupon-1', priceTotal: 148.5, seatCode: '12B', ticketNumber: '2174400123456' })
    expect(detail?.serviceRequests).toEqual([
      expect.objectContaining({ serviceRequestId: 'req-1', serviceCode: 'WCHR', status: 'requested' }),
    ])
    expect(detail?.history.map((entry) => entry.event)).toEqual(['held', 'confirmed'])
  })

  it('lets a customer read only its own booking', async () => {
    const h = makeHarness()
    h.db.booking.findUnique.mockResolvedValue(detailRow())

    await expect(h.service.getBookingDetail('ABC123', { customerId: 'customer-1' })).resolves.toMatchObject({ reference: 'ABC123' })
    await expect(h.service.getBookingDetail('ABC123', { customerId: 'customer-2' })).resolves.toBeNull()
  })

  it('lets staff read any booking', async () => {
    const h = makeHarness()
    h.db.booking.findUnique.mockResolvedValue(detailRow())

    await expect(h.service.getBookingDetail('ABC123', { staff: true })).resolves.toMatchObject({ reference: 'ABC123' })
  })

  it('finds a booking by reference and surname case-insensitively, and rejects an empty surname', async () => {
    const h = makeHarness()
    h.db.booking.findFirst.mockResolvedValue({ booking_reference: 'ABC123' })
    h.db.booking.findUnique.mockResolvedValue(detailRow())

    await expect(h.service.findBookingByReferenceAndSurname('ABC123', '  ')).resolves.toBeNull()
    expect(h.db.booking.findFirst).not.toHaveBeenCalled()

    await expect(h.service.findBookingByReferenceAndSurname('ABC123', 'wongchai')).resolves.toMatchObject({ reference: 'ABC123' })
    expect(h.db.booking.findFirst).toHaveBeenCalledWith({
      where: {
        booking_reference: 'ABC123',
        booking_passenger: { some: { passenger: { last_name: { equals: 'wongchai', mode: 'insensitive' } } } },
      },
      select: { booking_reference: true },
    })
  })

  it('returns null when the reference and surname do not match', async () => {
    const h = makeHarness()
    h.db.booking.findFirst.mockResolvedValue(null)

    await expect(h.service.findBookingByReferenceAndSurname('ABC123', 'nobody')).resolves.toBeNull()
  })

  it('loads the booking for a booking passenger id', async () => {
    const h = makeHarness()
    h.db.booking_passenger.findUnique.mockResolvedValue({ booking: { booking_reference: 'ABC123' } })
    h.db.booking.findUnique.mockResolvedValue(detailRow())

    await expect(h.service.getBookingForPassenger('bp-2')).resolves.toMatchObject({ reference: 'ABC123' })
    expect(h.db.booking_passenger.findUnique).toHaveBeenCalledWith({
      where: { id: 'bp-2' },
      select: { booking: { select: { booking_reference: true } } },
    })

    h.db.booking_passenger.findUnique.mockResolvedValue(null)
    await expect(h.service.getBookingForPassenger('missing')).resolves.toBeNull()
  })
})

describe('BookingReadService customer lists', () => {
  it('lists a customer booking with lead passenger, trip, total and open requests, newest departure first', async () => {
    const h = makeHarness()
    h.db.booking.findMany.mockResolvedValue([
      listRow({
        id: 'booking-old',
        booking_reference: 'OLD123',
        booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-10T02:00:00Z'))],
      }),
      listRow({
        id: 'booking-new',
        booking_reference: 'NEW123',
        booking_segment: [listSegment(1, 'BKK', 'HKT', new Date('2026-11-12T02:00:00Z'))],
      }),
    ])
    h.db.booking_coupon.findMany.mockResolvedValue([
      { booking_id: 'booking-old', price_total: '100.00', check_in: [] },
      { booking_id: 'booking-new', price_total: '250.00', check_in: [] },
    ])
    h.db.booking_service_request.findMany.mockResolvedValue([{ booking_id: 'booking-new' }])

    const items = await h.service.listCustomerBookings('customer-1')

    expect(items.map((item) => item.reference)).toEqual(['NEW123', 'OLD123'])
    expect(items[0]).toMatchObject({
      leadPassengerName: 'Somchai Wongchai',
      trip: 'BKK → HKT',
      total: 250,
      openServiceRequests: 1,
      travelDate: new Date('2026-11-12T02:00:00Z'),
    })
  })

  it('labels return trips with a double arrow and multi-city trips as a chain', async () => {
    const h = makeHarness()
    h.db.booking.findMany.mockResolvedValue([
      listRow({
        id: 'booking-return',
        booking_segment: [
          listSegment(1, 'BKK', 'NRT', new Date('2026-11-10T02:00:00Z')),
          listSegment(2, 'NRT', 'BKK', new Date('2026-11-12T02:00:00Z')),
        ],
      }),
      listRow({
        id: 'booking-multi',
        booking_segment: [
          listSegment(1, 'BKK', 'NRT', new Date('2026-11-11T02:00:00Z')),
          listSegment(2, 'NRT', 'LAX', new Date('2026-11-11T10:00:00Z')),
          listSegment(3, 'LAX', 'BKK', new Date('2026-11-13T02:00:00Z')),
        ],
      }),
    ])

    const items = await h.service.listCustomerBookings('customer-1')

    expect(items.map((item) => item.trip)).toEqual(['BKK → NRT → LAX → BKK', 'BKK ⇄ NRT'])
  })

  it('splits My Trips into upcoming and past using departure, closure and check-in', async () => {
    const h = makeHarness()
    h.db.customer.findUnique.mockResolvedValue({ id: 'customer-1' })
    h.db.booking.findMany.mockResolvedValue([
      listRow({
        id: 'future',
        booking_reference: 'FUT123',
        status: 'confirmed',
        booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-12T02:00:00Z'))],
      }),
      listRow({
        id: 'departed',
        booking_reference: 'DEP123',
        status: 'confirmed',
        booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-07T02:00:00Z'))],
      }),
      listRow({
        id: 'cancelled',
        booking_reference: 'CAN123',
        status: 'cancelled',
        booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-12T02:00:00Z'))],
      }),
      listRow({
        id: 'checked-in',
        booking_reference: 'CHK123',
        status: 'confirmed',
        booking_segment: [listSegment(1, 'BKK', 'NRT', new Date('2026-11-12T02:00:00Z'))],
      }),
    ])
    h.db.booking_coupon.findMany.mockResolvedValue([{ booking_id: 'checked-in', price_total: '100', check_in: [{ status: 'checked_in' }] }])

    const trips = await h.service.listCustomerTrips('user-1')

    expect(trips.upcoming.map((item) => item.reference)).toEqual(['FUT123'])
    expect(trips.past.map((item) => item.reference)).toEqual(['CAN123', 'CHK123', 'DEP123'])
  })

  it('rejects a user without a customer profile', async () => {
    const h = makeHarness()
    h.db.customer.findUnique.mockResolvedValue(null)

    await expect(h.service.listCustomerTrips('user-1')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('BookingReadService staff list', () => {
  it('applies status, travel period and flight filters when search is empty', async () => {
    const h = makeHarness()
    const from = new Date('2026-11-10T00:00:00Z')
    const to = new Date('2026-11-11T00:00:00Z')
    h.db.booking.findMany.mockResolvedValue([listRow()])
    h.db.booking.count.mockResolvedValue(1)

    const page = await h.service.listStaffBookings({
      status: 'confirmed',
      dateType: 'travelling',
      from,
      to,
      flightId: 'flight-1',
      page: 2,
      pageSize: 10,
    })

    expect(h.db.booking.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { status: 'confirmed' },
          { booking_segment: { some: { flight_id: 'flight-1' } } },
          { booking_segment: { some: { seat_inventory: { flight: { dep_at: { gte: from, lte: to } } } } } },
        ],
      },
      select: expect.anything(),
      orderBy: { booked_at: 'desc' },
      skip: 10,
      take: 10,
    })
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 })
    expect(page.items[0]).toMatchObject({ reference: 'ABC123', leadPassengerName: 'Somchai Wongchai' })
  })

  it('searches reference, passenger name, passport and ticket while ignoring filters, and clamps paging', async () => {
    const h = makeHarness()
    h.db.booking.findMany.mockResolvedValue([])
    h.db.booking.count.mockResolvedValue(0)

    const page = await h.service.listStaffBookings({
      search: '217-4400123456',
      status: 'cancelled',
      flightId: 'flight-1',
      page: 0,
      pageSize: 500,
    })

    const where = h.db.booking.findMany.mock.calls[0][0].where
    expect(where.AND).toBeUndefined()
    expect(where.OR).toHaveLength(3)
    expect(where.OR[0]).toEqual({ booking_reference: { contains: '217-4400123456', mode: 'insensitive' } })
    expect(where.OR[2]).toEqual({
      booking_passenger: { some: { booking_coupon: { some: { ticket_number: { contains: '2174400123456' } } } } },
    })
    expect(h.db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }))
    expect(page).toMatchObject({ page: 1, pageSize: 100 })

    await h.service.listStaffBookings({ search: 'Somchai', status: 'cancelled' })
    const nameWhere = h.db.booking.findMany.mock.calls[1][0].where
    expect(nameWhere.AND).toBeUndefined()
    expect(nameWhere.OR).toHaveLength(2)
  })
})

describe('BookingReadService feature reads', () => {
  it('lists confirmed flight passengers with seats and live service codes, sorted by name', async () => {
    const h = makeHarness()
    const passenger = (id: string, firstName: string, lastName: string, seat: string) => ({
      booking_passenger_id: id,
      passenger_id: `p-${id}`,
      booking_passenger: {
        passenger_type: 'adult',
        passenger: { first_name: firstName, last_name: lastName },
        booking: { booking_reference: 'ABC123', contact_email: 'a@example.com', contact_phone: null },
      },
      booking_segment: { cabin: 'economy', fare_class: { code: 'Y' } },
      seat_assignment: [{ seat_code: seat, status: 'assigned' }],
    })
    h.db.booking_coupon.findMany.mockResolvedValue([passenger('bp-z', 'Zara', 'Zulu', '20A'), passenger('bp-a', 'Ann', 'Alpha', '12B')])
    h.db.booking_service_request.findMany.mockResolvedValue([
      { booking_passenger_id: 'bp-a', service_code: 'WCHR' },
      { booking_passenger_id: 'bp-a', service_code: 'WCHR' },
      { booking_passenger_id: 'bp-a', service_code: 'MEDA' },
    ])

    const list = await h.service.listFlightPassengers('flight-1')

    expect(h.db.booking_coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { flight_id: 'flight-1', status: 'confirmed' } }),
    )
    expect(list.map((row) => row.lastName)).toEqual(['Alpha', 'Zulu'])
    expect(list[0]).toMatchObject({
      bookingReference: 'ABC123',
      firstName: 'Ann',
      seatCode: '12B',
      fareClassCode: 'Y',
      serviceCodes: ['WCHR', 'MEDA'],
    })
  })

  it('lists a passenger upcoming confirmed flights in departure order', async () => {
    const h = makeHarness()
    const row = (bookingId: string, flightId: string, depAt: Date) => ({
      booking_id: bookingId,
      flight_id: flightId,
      booking_segment: {
        booking: { booking_reference: `REF${bookingId}`, status: 'confirmed' },
        seat_inventory: {
          flight: {
            flight_number: `FL${flightId}`,
            dep_at: depAt,
            route: { origin: 'BKK', destination: 'NRT' },
          },
        },
      },
    })
    h.db.booking_coupon.findMany.mockResolvedValue([
      row('b1', 'f1', new Date('2026-11-10T02:00:00Z')),
      row('b2', 'f2', new Date('2026-11-12T02:00:00Z')),
    ])

    const flights = await h.service.listUpcomingFlights('p-1')

    expect(h.db.booking_coupon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { passenger_id: 'p-1', status: 'confirmed', booking_segment: { seat_inventory: { flight: { dep_at: { gt: NOW } } } } },
        orderBy: { booking_segment: { seat_inventory: { flight: { dep_at: 'asc' } } } },
      }),
    )
    expect(flights).toEqual([
      expect.objectContaining({ bookingId: 'b1', flightId: 'f1', reference: 'REFb1', origin: 'BKK', destination: 'NRT' }),
      expect.objectContaining({ bookingId: 'b2', flightId: 'f2', reference: 'REFb2' }),
    ])
  })

  it('counts distinct bookings, passengers and open requests for a flight', async () => {
    const h = makeHarness()
    h.db.booking_coupon.groupBy.mockResolvedValue([
      { booking_id: 'b1', _count: { _all: 2 } },
      { booking_id: 'b2', _count: { _all: 1 } },
    ])
    h.db.booking_service_request.count.mockResolvedValue(3)

    await expect(h.service.countBookingsForFlight('flight-1')).resolves.toEqual({
      bookings: 2,
      passengers: 3,
      openServiceRequests: 3,
    })
    expect(h.db.booking_coupon.groupBy).toHaveBeenCalledWith({
      by: ['booking_id'],
      where: { flight_id: 'flight-1', status: { in: ['held', 'confirmed'] } },
      _count: { _all: true },
    })
    expect(h.db.booking_service_request.count).toHaveBeenCalledWith({
      where: {
        status: { in: ['requested', 'accepted'] },
        OR: [
          { booking_segment: { flight_id: 'flight-1' } },
          {
            booking_segment_id: null,
            booking_passenger: { booking_coupon: { some: { flight_id: 'flight-1', status: { in: ['held', 'confirmed'] } } } },
          },
        ],
      },
    })
  })
})

describe('BookingReadService route helpers', () => {
  it('resolves a staff user to an unrestricted viewer', async () => {
    const h = makeHarness()
    h.db.user.findUnique.mockResolvedValue({ type: 'staff' })
    h.db.booking.findUnique.mockResolvedValue(detailRow({ customer_id: 'someone-else' }))

    await expect(h.service.getBookingForUser('ABC123', 'user-1')).resolves.toMatchObject({ reference: 'ABC123' })
    expect(h.db.customer.findUnique).not.toHaveBeenCalled()
  })

  it('resolves a customer user to its own customer id', async () => {
    const h = makeHarness()
    h.db.user.findUnique.mockResolvedValue({ type: 'customer' })
    h.db.customer.findUnique.mockResolvedValue({ id: 'customer-1' })
    h.db.booking.findUnique.mockResolvedValue(detailRow())

    await expect(h.service.getBookingForUser('ABC123', 'user-1')).resolves.toMatchObject({ reference: 'ABC123' })
    expect(h.db.customer.findUnique).toHaveBeenCalledWith({ where: { user_id: 'user-1' }, select: { id: true } })

    h.db.customer.findUnique.mockResolvedValue(null)
    await expect(h.service.getBookingForUser('ABC123', 'user-2')).resolves.toBeNull()
  })
})
