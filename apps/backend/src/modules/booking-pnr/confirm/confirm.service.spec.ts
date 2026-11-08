import { NotFoundException } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import { BookingStatusService } from '../common/booking-status.service'
import { ConfirmService } from './confirm.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-08T10:00:00Z')

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    booking_reference: 'ABC123',
    status: 'held',
    customer_id: 'customer-1',
    currency: 'USD',
    payment_type: 'cash',
    hold_expires_at: new Date('2026-11-08T10:15:00Z'),
    confirmed_at: null,
    booking_passenger: [
      { passenger_id: 'p1', passenger_type: 'adult' },
      { passenger_id: 'p2', passenger_type: 'child' },
      { passenger_id: 'p3', passenger_type: 'infant' },
    ],
    booking_segment: [
      { flight_id: 'f2', cabin: 'economy' },
      { flight_id: 'f1', cabin: 'business' },
    ],
    ...overrides,
  }
}

function makeCoupons() {
  return [
    { fare_quote_id: null, price_total: 148.5, fare_quote: null },
    { fare_quote_id: null, price_total: 148.5, fare_quote: null },
  ]
}

function makeHarness() {
  const booking = makeBooking()
  const coupons = makeCoupons()
  const flights = [
    { id: 'f1', status: 'scheduled' },
    { id: 'f2', status: 'delayed' },
  ]

  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?')
      if (sql.includes('nextval')) {
        return Promise.resolve([{ nextval: 1n }])
      }
      return Promise.resolve([{ id: booking.id, status: booking.status, confirmed_at: booking.confirmed_at }])
    }),
    booking: { update: jest.fn().mockResolvedValue({}) },
    booking_coupon: {
      findMany: jest.fn().mockResolvedValue([{ id: 'coupon-1' }, { id: 'coupon-2' }]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  }

  const db = {
    booking: { findUnique: jest.fn().mockResolvedValue(booking) },
    booking_coupon: { findMany: jest.fn().mockResolvedValue(coupons) },
    flight: { findMany: jest.fn().mockResolvedValue(flights) },
    customer_passenger: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  }

  const inventory = { lock: jest.fn().mockResolvedValue(undefined), sell: jest.fn().mockResolvedValue(undefined) }
  const seats = { assignHeldForBooking: jest.fn().mockResolvedValue(undefined) }
  const refunds = { record: jest.fn().mockResolvedValue(undefined) }
  const pricing = { redeem: jest.fn().mockResolvedValue(undefined) }
  const screening = { screen: jest.fn().mockResolvedValue({ result: 'clear', reasons: [] }) }
  const events = { publish: jest.fn().mockResolvedValue(undefined), subscribe: jest.fn() }
  const clock = { now: () => NOW }

  const service = new ConfirmService(
    db as never,
    new BookingStatusService(clock),
    clock,
    inventory as never,
    seats as never,
    refunds,
    pricing as never,
    screening,
    events,
  )

  return { booking, coupons, flights, tx, db, inventory, seats, refunds, pricing, screening, events, service }
}

describe('ConfirmService.confirmBooking', () => {
  it('sells the held seats, confirms, assigns seats, issues tickets and publishes after commit', async () => {
    const h = makeHarness()

    const result = await h.service.confirmBooking('ABC123')

    expect(h.inventory.lock).toHaveBeenCalledWith(h.tx, [
      { flightId: 'f1', cabin: 'business' },
      { flightId: 'f2', cabin: 'economy' },
    ])
    expect(h.inventory.sell).toHaveBeenCalledWith(
      h.tx,
      [
        { flightId: 'f1', cabin: 'business' },
        { flightId: 'f2', cabin: 'economy' },
      ],
      2,
      false,
    )
    expect(h.tx.booking.update).toHaveBeenCalledWith({
      where: { id: 'booking-1' },
      data: expect.objectContaining({ status: 'confirmed', confirmed_at: NOW }),
    })
    expect(h.tx.booking_coupon.update).toHaveBeenCalledTimes(2)
    expect(h.seats.assignHeldForBooking).toHaveBeenCalledWith(h.tx, 'booking-1', NOW)
    expect(h.events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'booking.confirmed', reference: 'ABC123', flightIds: ['f2', 'f1'] }),
    )
    expect(h.db.customer_passenger.updateMany).toHaveBeenCalledWith({
      where: { customer_id: 'customer-1', passenger_id: { in: ['p1', 'p2', 'p3'] } },
      data: { last_booked_at: NOW, updated_at: expect.any(Date) },
    })
    expect(result).toMatchObject({ bookingId: 'booking-1', reference: 'ABC123', status: 'confirmed', total: 297, confirmedAt: NOW })
  })

  it('returns the same result when the booking is already confirmed', async () => {
    const h = makeHarness()
    const confirmedAt = new Date('2026-11-08T09:30:00Z')
    h.booking.status = 'confirmed'
    h.booking.confirmed_at = confirmedAt

    const result = await h.service.confirmBooking('ABC123')

    expect(h.db.$transaction).not.toHaveBeenCalled()
    expect(h.inventory.sell).not.toHaveBeenCalled()
    expect(h.events.publish).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'confirmed', confirmedAt })
  })

  it('refuses a cancelled booking', async () => {
    const h = makeHarness()
    h.booking.status = 'cancelled'

    await expect(h.service.confirmBooking('ABC123')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE' })
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses an expired booking until B3 adds the late-payment retry', async () => {
    const h = makeHarness()
    h.booking.status = 'expired'

    await expect(h.service.confirmBooking('ABC123')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE' })
  })

  it('refunds and answers FLIGHT_NOT_FOR_SALE when a flight is no longer sellable', async () => {
    const h = makeHarness()
    h.flights[0] = { id: 'f1', status: 'cancelled' }

    const error: unknown = await h.service.confirmBooking('ABC123').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(BookingError)
    expect(error).toMatchObject({ code: 'FLIGHT_NOT_FOR_SALE' })
    expect(h.refunds.record).toHaveBeenCalledWith({ bookingId: 'booking-1', amount: 297, currency: 'USD', reason: 'flight_not_for_sale' })
    expect(h.db.$transaction).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown reference', async () => {
    const h = makeHarness()
    h.db.booking.findUnique.mockResolvedValue(null)

    await expect(h.service.confirmBooking('NOPE00')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('redeems each promo quote once at confirm', async () => {
    const h = makeHarness()
    h.db.booking_coupon.findMany.mockResolvedValue([
      { fare_quote_id: 'quote-1', price_total: 100, fare_quote: { promo_code: { code: 'SAVE10' } } },
      { fare_quote_id: 'quote-1', price_total: 100, fare_quote: { promo_code: { code: 'SAVE10' } } },
      { fare_quote_id: 'quote-2', price_total: 100, fare_quote: { promo_code: { code: 'FALL' } } },
    ])

    await h.service.confirmBooking('ABC123')

    expect(h.pricing.redeem).toHaveBeenCalledTimes(2)
    expect(h.pricing.redeem).toHaveBeenCalledWith('SAVE10', 'quote-1')
    expect(h.pricing.redeem).toHaveBeenCalledWith('FALL', 'quote-2')
  })
})
