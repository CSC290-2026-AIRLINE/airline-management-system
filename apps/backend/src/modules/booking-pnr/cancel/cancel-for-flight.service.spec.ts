import { BookingStatusService } from '../common/booking-status.service'
import type { BookingTransaction, FlightEvent } from '../contracts'
import { CancelForFlightService } from './cancel-for-flight.service'

const NOW = new Date('2026-11-09T10:00:00Z')
const FLIGHT_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_FLIGHT_ID = '33333333-3333-3333-3333-333333333333'
const EVENT_ID = '22222222-2222-2222-2222-222222222222'

type Status = 'held' | 'confirmed' | 'cancelled' | 'expired'

interface FakeBooking {
  id: string
  status: Status
}

interface FakeCoupon {
  id: string
  booking_id: string
  flight_id: string
  status: Status
  ticket_number: string | null
  cancel_reason: string | null
  partner_airline: string | null
  cancelled_at: Date | null
}

interface StatusFilter {
  in?: string[]
  not?: string
}

interface CouponWhere {
  flight_id?: string
  booking_id?: string | { in?: string[] }
  status?: string | StatusFilter
}

interface UpdateArgs {
  where: Record<string, unknown>
  data: Record<string, unknown>
}

function makeBooking(id: string, status: Status = 'confirmed'): FakeBooking {
  return { id, status }
}

function makeCoupon(id: string, bookingId: string, status: Status = 'confirmed', flightId: string = FLIGHT_ID): FakeCoupon {
  return {
    id,
    booking_id: bookingId,
    flight_id: flightId,
    status,
    ticket_number: status === 'confirmed' ? '9990000000000' : null,
    cancel_reason: null,
    partner_airline: null,
    cancelled_at: null,
  }
}

function makeEvent(overrides: Partial<FlightEvent> = {}): FlightEvent {
  return {
    id: EVENT_ID,
    seq: 1n,
    flightId: FLIGHT_ID,
    type: 'flight.cancelled',
    occurredAt: NOW,
    oldAircraftId: null,
    newAircraftId: null,
    resolution: 'refund',
    partnerAirline: null,
    ...overrides,
  }
}

function statusMatches(status: string, filter: string | StatusFilter | undefined): boolean {
  if (!filter) {
    return true
  }
  if (typeof filter === 'string') {
    return status === filter
  }
  if (filter.in) {
    return filter.in.includes(status)
  }
  if (filter.not) {
    return status !== filter.not
  }
  return true
}

function matchesCoupon(coupon: FakeCoupon, where: CouponWhere): boolean {
  if (where.flight_id && coupon.flight_id !== where.flight_id) {
    return false
  }
  if (typeof where.booking_id === 'string') {
    if (coupon.booking_id !== where.booking_id) {
      return false
    }
  } else if (where.booking_id?.in && !where.booking_id.in.includes(coupon.booking_id)) {
    return false
  }
  return statusMatches(coupon.status, where.status)
}

function makeHarness(bookings: FakeBooking[], coupons: FakeCoupon[]) {
  const bookingUpdates: UpdateArgs[] = []
  const couponUpdates: UpdateArgs[] = []
  const couponUpdateManys: UpdateArgs[] = []
  let ticketSequence = 0
  const checkInFindFirst = jest.fn(() => Promise.reject(new Error('B14 must not read check_in')))

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      if (strings.join('?').includes('nextval')) {
        ticketSequence += 1
        return Promise.resolve([{ nextval: BigInt(ticketSequence) }])
      }
      const locked = bookings
        .filter((booking) =>
          coupons.some(
            (coupon) =>
              coupon.booking_id === booking.id &&
              coupon.flight_id === FLIGHT_ID &&
              (coupon.status === 'held' || coupon.status === 'confirmed'),
          ),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
      return Promise.resolve(locked.map((booking) => ({ id: booking.id, status: booking.status })))
    }),
    booking: {
      update: jest.fn((args: UpdateArgs) => {
        bookingUpdates.push(args)
        const booking = bookings.find((row) => row.id === args.where.id)
        if (booking) {
          Object.assign(booking, args.data)
        }
        return Promise.resolve(booking)
      }),
    },
    booking_coupon: {
      findMany: jest.fn((args: { where: CouponWhere }) =>
        Promise.resolve(
          coupons
            .filter((coupon) => matchesCoupon(coupon, args.where))
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((coupon) => ({ id: coupon.id, booking_id: coupon.booking_id, status: coupon.status })),
        ),
      ),
      count: jest.fn((args: { where: CouponWhere }) =>
        Promise.resolve(coupons.filter((coupon) => matchesCoupon(coupon, args.where)).length),
      ),
      update: jest.fn((args: UpdateArgs) => {
        couponUpdates.push(args)
        const coupon = coupons.find((row) => row.id === args.where.id)
        if (coupon) {
          Object.assign(coupon, args.data)
        }
        return Promise.resolve(coupon)
      }),
      updateMany: jest.fn((args: UpdateArgs) => {
        couponUpdateManys.push(args)
        let count = 0
        for (const coupon of coupons) {
          if (matchesCoupon(coupon, args.where)) {
            Object.assign(coupon, args.data)
            count += 1
          }
        }
        return Promise.resolve({ count })
      }),
    },
    check_in: { findFirst: checkInFindFirst },
  }

  const clock = { now: () => NOW }
  const service = new CancelForFlightService(new BookingStatusService(clock), clock)

  return {
    service,
    tx,
    bookings,
    coupons,
    bookingUpdates,
    couponUpdates,
    couponUpdateManys,
    checkInFindFirst,
    ticketSequence: () => ticketSequence,
  }
}

describe('CancelForFlightService.cancelBookingsForFlight', () => {
  it('cancels every confirmed coupon on the flight and the booking when none of its coupons remain', async () => {
    const h = makeHarness([makeBooking('booking-1')], [makeCoupon('coupon-1', 'booking-1'), makeCoupon('coupon-2', 'booking-1')])

    const result = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, makeEvent())

    expect(result).toEqual({
      eventId: EVENT_ID,
      affectedBookingIds: ['booking-1'],
      cancelledCouponIds: ['coupon-1', 'coupon-2'],
    })
    expect(h.couponUpdates).toHaveLength(2)
    for (const update of h.couponUpdates) {
      expect(update.data).toMatchObject({
        status: 'cancelled',
        cancel_reason: 'flight_cancelled',
        partner_airline: null,
        cancelled_at: NOW,
      })
      expect(update.data).not.toHaveProperty('ticket_number')
    }
    expect(h.bookingUpdates).toHaveLength(1)
    expect(h.bookingUpdates[0]?.data).toMatchObject({ status: 'cancelled', cancelled_at: NOW })
    expect(h.couponUpdateManys).toHaveLength(1)
    expect(h.couponUpdateManys[0]?.where).toEqual({ booking_id: 'booking-1', status: 'confirmed' })
    expect(h.ticketSequence()).toBe(0)
    expect(h.checkInFindFirst).not.toHaveBeenCalled()
  })

  it('keeps a confirmed booking when it still has a coupon on another flight', async () => {
    const h = makeHarness(
      [makeBooking('booking-1')],
      [makeCoupon('coupon-1', 'booking-1'), makeCoupon('coupon-2', 'booking-1', 'confirmed', OTHER_FLIGHT_ID)],
    )

    const result = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, makeEvent())

    expect(result.affectedBookingIds).toEqual(['booking-1'])
    expect(result.cancelledCouponIds).toEqual(['coupon-1'])
    expect(h.bookingUpdates).toHaveLength(0)
    expect(h.couponUpdateManys).toHaveLength(0)
    expect(h.coupons.find((coupon) => coupon.id === 'coupon-2')?.status).toBe('confirmed')
  })

  it('expires a held booking whole and issues a ticket for the held coupon it cancels', async () => {
    const h = makeHarness(
      [makeBooking('booking-1', 'held')],
      [makeCoupon('coupon-1', 'booking-1', 'held'), makeCoupon('coupon-2', 'booking-1', 'held', OTHER_FLIGHT_ID)],
    )

    const result = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, makeEvent())

    expect(result).toEqual({
      eventId: EVENT_ID,
      affectedBookingIds: ['booking-1'],
      cancelledCouponIds: ['coupon-1'],
    })
    expect(h.couponUpdates).toHaveLength(1)
    expect(h.couponUpdates[0]?.data).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'flight_cancelled',
      cancelled_at: NOW,
      ticket_number: '9990000000001',
    })
    expect(h.ticketSequence()).toBe(1)
    expect(h.bookingUpdates).toHaveLength(1)
    expect(h.bookingUpdates[0]?.data).toMatchObject({ status: 'expired' })
    expect(h.bookingUpdates[0]?.data).not.toHaveProperty('cancelled_at')
    expect(h.couponUpdateManys).toHaveLength(1)
    expect(h.couponUpdateManys[0]?.where).toEqual({ booking_id: 'booking-1', status: 'held' })
    expect(h.coupons.find((coupon) => coupon.id === 'coupon-1')?.status).toBe('cancelled')
    expect(h.coupons.find((coupon) => coupon.id === 'coupon-2')?.status).toBe('expired')
  })

  it('records the partner airline and reason for a partner rebook', async () => {
    const h = makeHarness([makeBooking('booking-1')], [makeCoupon('coupon-1', 'booking-1')])

    await h.service.cancelBookingsForFlight(
      h.tx as unknown as BookingTransaction,
      FLIGHT_ID,
      makeEvent({ resolution: 'rebook_partner', partnerAirline: 'TG' }),
    )

    expect(h.couponUpdates[0]?.data).toMatchObject({
      cancel_reason: 'rebooked_partner',
      partner_airline: 'TG',
    })
    expect(h.bookingUpdates[0]?.data).toMatchObject({ status: 'cancelled' })
  })

  it('refuses a partner rebook without a partner airline and writes nothing', async () => {
    const h = makeHarness([makeBooking('booking-1')], [makeCoupon('coupon-1', 'booking-1')])

    await expect(
      h.service.cancelBookingsForFlight(
        h.tx as unknown as BookingTransaction,
        FLIGHT_ID,
        makeEvent({ resolution: 'rebook_partner', partnerAirline: null }),
      ),
    ).rejects.toThrow('missing its partner airline')

    expect(h.tx.$queryRaw).not.toHaveBeenCalled()
    expect(h.couponUpdates).toHaveLength(0)
    expect(h.bookingUpdates).toHaveLength(0)
  })

  it('is idempotent when the same event is handled twice', async () => {
    const h = makeHarness([makeBooking('booking-1')], [makeCoupon('coupon-1', 'booking-1')])
    const event = makeEvent()

    const first = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, event)
    const firstCouponUpdates = h.couponUpdates.length
    const firstBookingUpdates = h.bookingUpdates.length
    const second = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, event)

    expect(first.cancelledCouponIds).toEqual(['coupon-1'])
    expect(second).toEqual({ eventId: EVENT_ID, affectedBookingIds: [], cancelledCouponIds: [] })
    expect(h.couponUpdates).toHaveLength(firstCouponUpdates)
    expect(h.bookingUpdates).toHaveLength(firstBookingUpdates)
  })

  it('does nothing when the flight has no held or confirmed coupons', async () => {
    const h = makeHarness([makeBooking('booking-1')], [makeCoupon('coupon-1', 'booking-1', 'confirmed', OTHER_FLIGHT_ID)])

    const result = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, makeEvent())

    expect(result).toEqual({ eventId: EVENT_ID, affectedBookingIds: [], cancelledCouponIds: [] })
    expect(h.couponUpdates).toHaveLength(0)
    expect(h.bookingUpdates).toHaveLength(0)
    expect(h.ticketSequence()).toBe(0)
  })

  it('handles held, fully cancelled and partially cancelled confirmed bookings in one event', async () => {
    const h = makeHarness(
      [makeBooking('booking-1', 'held'), makeBooking('booking-2'), makeBooking('booking-3')],
      [
        makeCoupon('coupon-1', 'booking-1', 'held'),
        makeCoupon('coupon-2', 'booking-2'),
        makeCoupon('coupon-3', 'booking-3'),
        makeCoupon('coupon-4', 'booking-3', 'confirmed', OTHER_FLIGHT_ID),
      ],
    )

    const result = await h.service.cancelBookingsForFlight(h.tx as unknown as BookingTransaction, FLIGHT_ID, makeEvent())

    expect(result.affectedBookingIds).toEqual(['booking-1', 'booking-2', 'booking-3'])
    expect(result.cancelledCouponIds).toEqual(['coupon-1', 'coupon-2', 'coupon-3'])
    expect(h.bookings.find((booking) => booking.id === 'booking-1')?.status).toBe('expired')
    expect(h.bookings.find((booking) => booking.id === 'booking-2')?.status).toBe('cancelled')
    expect(h.bookings.find((booking) => booking.id === 'booking-3')?.status).toBe('confirmed')
    expect(h.bookingUpdates).toHaveLength(2)
  })
})
