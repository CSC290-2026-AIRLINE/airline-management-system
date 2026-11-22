import type { DbService } from '@backend/db/db.service'
import type { BookingClock, PricingPort, SeatMapPort, SeatPort } from '../contracts'
import { HeldSeatChangeService } from './held-seat-change.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

describe('HeldSeatChangeService', () => {
  const NOW = new Date('2026-11-01T10:00:00.000Z')
  const EXPIRES = new Date('2026-11-01T10:15:00.000Z')
  const coupon = {
    id: 'coupon',
    booking_id: 'booking',
    flight_id: 'flight',
    status: 'held',
    booking_segment: { cabin: 'economy', fare_class_id: 'fare' },
    booking_passenger: { passenger_type: 'adult', other_booking_passenger: null, booking_service_request: [] },
    fare_quote: { fare_class_id: 'fare', promo_code: { code: 'SUMMER' } },
  }
  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve([{ id: 'booking', status: 'held', hold_expires_at: EXPIRES, currency: 'USD' }])),
    booking_coupon: {
      findFirst: jest.fn(() => Promise.resolve(coupon)),
      update: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn(() => Promise.resolve({ _sum: { price_total: 120 } })),
    },
  }
  const db = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) }
  const seats = { releaseForCoupon: jest.fn().mockResolvedValue(undefined), holdForBooking: jest.fn().mockResolvedValue(undefined) }
  const layouts = {
    getSeatMap: jest.fn(() =>
      Promise.resolve({
        cabins: [],
        rows: [
          {
            row: 12,
            seats: [
              { seatCode: '12A', row: 12, column: 'A', cabin: 'economy', type: 'standard', blocked: false },
              { seatCode: '12B', row: 12, column: 'B', cabin: 'economy', type: 'standard', blocked: false },
              { seatCode: '1A', row: 1, column: 'A', cabin: 'economy', type: 'standard', blocked: true },
              { seatCode: '12C', row: 12, column: 'C', cabin: 'business', type: 'standard', blocked: false },
            ],
          },
        ],
      }),
    ),
  }
  const pricing = {
    seatFee: jest.fn(() => Promise.resolve(12)),
    quote: jest.fn(() =>
      Promise.resolve({
        fareQuoteId: 'quote-2',
        fareClassId: 'fare',
        currency: 'USD',
        pricePerPassenger: 60,
        fareRuleSnapshot: null,
        lines: [],
      }),
    ),
  }
  const clock: BookingClock = { now: () => NOW }
  const service = new HeldSeatChangeService(
    db as unknown as DbService,
    seats as unknown as SeatPort,
    layouts as unknown as SeatMapPort,
    pricing as unknown as PricingPort,
    clock,
  )

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx))
    tx.$queryRaw.mockResolvedValue([{ id: 'booking', status: 'held', hold_expires_at: EXPIRES, currency: 'USD' }])
    tx.booking_coupon.findFirst.mockResolvedValue(coupon)
    tx.booking_coupon.update.mockResolvedValue({})
    tx.booking_coupon.aggregate.mockResolvedValue({ _sum: { price_total: 120 } })
    layouts.getSeatMap.mockResolvedValue({
      cabins: [],
      rows: [
        {
          row: 12,
          seats: [
            { seatCode: '12A', row: 12, column: 'A', cabin: 'economy', type: 'standard', blocked: false },
            { seatCode: '12B', row: 12, column: 'B', cabin: 'economy', type: 'standard', blocked: false },
            { seatCode: '1A', row: 1, column: 'A', cabin: 'economy', type: 'standard', blocked: true },
            { seatCode: '12C', row: 12, column: 'C', cabin: 'business', type: 'standard', blocked: false },
          ],
        },
      ],
    })
    pricing.seatFee.mockResolvedValue(12)
    pricing.quote.mockResolvedValue({
      fareQuoteId: 'quote-2',
      fareClassId: 'fare',
      currency: 'USD',
      pricePerPassenger: 60,
      fareRuleSnapshot: null,
      lines: [],
    })
  })

  it('moves the coupon to the new seat and re-prices the booking', async () => {
    await expect(service.changeSeat('REF', 'coupon', '12B')).resolves.toEqual({
      status: 'assigned',
      seat: { seatCode: '12B', type: 'standard' },
      total: 120,
      currency: 'USD',
    })
    expect(seats.releaseForCoupon).toHaveBeenCalledWith(tx, 'coupon', NOW)
    expect(seats.holdForBooking).toHaveBeenCalledWith(
      tx,
      'booking',
      [{ bookingCouponId: 'coupon', flightId: 'flight', seatCode: '12B', fee: 12 }],
      EXPIRES,
    )
    expect(tx.booking_coupon.update).toHaveBeenCalledWith({
      where: { id: 'coupon' },
      data: { fare_quote_id: 'quote-2', price_total: '60.00', updated_at: NOW },
    })
  })

  it('holds the new seat for the rest of the booking hold, so the hold is not extended', async () => {
    await service.changeSeat('REF', 'coupon', '12B')
    expect(seats.holdForBooking).toHaveBeenCalledWith(tx, 'booking', expect.any(Array), EXPIRES)
  })

  it('re-prices the coupon with the fare class, promo code and seat type of the new seat', async () => {
    await service.changeSeat('REF', 'coupon', '12B')
    expect(pricing.quote).toHaveBeenCalledWith({
      flightId: 'flight',
      cabin: 'economy',
      fareClassId: 'fare',
      promoCode: 'SUMMER',
      seatType: 'standard',
    })
  })

  it('refuses a booking that is not on hold', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'booking', status: 'confirmed', hold_expires_at: EXPIRES, currency: 'USD' }])
    await expect(service.changeSeat('REF', 'coupon', '12B')).rejects.toMatchObject({ code: 'BOOKING_CLOSED', status: 409 })
    expect(seats.holdForBooking).not.toHaveBeenCalled()
  })

  it('refuses a booking whose hold has expired', async () => {
    tx.$queryRaw.mockResolvedValue([
      { id: 'booking', status: 'held', hold_expires_at: new Date('2026-11-01T09:59:00.000Z'), currency: 'USD' },
    ])
    await expect(service.changeSeat('REF', 'coupon', '12B')).rejects.toMatchObject({ code: 'BOOKING_CLOSED', status: 409 })
    expect(seats.holdForBooking).not.toHaveBeenCalled()
  })

  it('refuses a booking it cannot find', async () => {
    tx.$queryRaw.mockResolvedValue([])
    await expect(service.changeSeat('REF', 'coupon', '12B')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE', status: 404 })
  })

  it('refuses a coupon that is not on hold', async () => {
    tx.booking_coupon.findFirst.mockResolvedValue(null)
    await expect(service.changeSeat('REF', 'coupon', '12B')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATE', status: 404 })
    expect(seats.releaseForCoupon).not.toHaveBeenCalled()
  })

  it('refuses a seat that does not exist on the aircraft', async () => {
    await expect(service.changeSeat('REF', 'coupon', '99Z')).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED', status: 422 })
    expect(seats.holdForBooking).not.toHaveBeenCalled()
  })

  it('refuses a blocked seat', async () => {
    await expect(service.changeSeat('REF', 'coupon', '1A')).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED', status: 422 })
  })

  it('refuses a seat in another cabin', async () => {
    await expect(service.changeSeat('REF', 'coupon', '12C')).rejects.toMatchObject({ code: 'SEAT_NOT_ALLOWED', status: 422 })
  })
})
