import { NotFoundException } from '@nestjs/common'
import { BookingStatusService } from '../common/booking-status.service'
import type { BookingDetail } from '../contracts'
import { CancelService } from './cancel.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-09T10:00:00Z')
const BOOKING_ID = 'booking-1'
const REFERENCE = 'ABC123'
const COUPON_IDS = ['coupon-1', 'coupon-2', 'coupon-3', 'coupon-4', 'coupon-5', 'coupon-6']

function makeDetail(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    bookingId: BOOKING_ID,
    reference: REFERENCE,
    status: 'confirmed',
    tripType: 'return',
    paymentType: 'cash',
    customerId: 'customer-1',
    bookedByStaffId: null,
    contactEmail: 'traveller@example.com',
    contactPhone: null,
    currency: 'USD',
    total: 300,
    bookedAt: new Date('2026-11-01T10:00:00Z'),
    holdExpiresAt: new Date('2026-11-01T10:30:00Z'),
    confirmedAt: new Date('2026-11-01T10:10:00Z'),
    cancelledAt: null,
    passengers: [
      {
        bookingPassengerId: 'bp-1',
        passengerId: 'p1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        passengerType: 'adult',
        lapOfBookingPassengerId: null,
      },
      {
        bookingPassengerId: 'bp-2',
        passengerId: 'p2',
        firstName: 'Grace',
        lastName: 'Hopper',
        passengerType: 'child',
        lapOfBookingPassengerId: null,
      },
      {
        bookingPassengerId: 'bp-3',
        passengerId: 'p3',
        firstName: 'Baby',
        lastName: 'Lovelace',
        passengerType: 'infant',
        lapOfBookingPassengerId: 'bp-1',
      },
    ],
    segments: [
      {
        bookingSegmentId: 'seg-1',
        flightId: 'f2',
        segmentOrder: 1,
        cabin: 'economy',
        fareClassId: 'fc-1',
        fareClassCode: 'Y',
        flightNumber: 'TG1',
        origin: 'BKK',
        destination: 'NRT',
        depAt: new Date('2026-12-01T10:00:00Z'),
        arrAt: new Date('2026-12-01T18:00:00Z'),
      },
      {
        bookingSegmentId: 'seg-2',
        flightId: 'f1',
        segmentOrder: 2,
        cabin: 'business',
        fareClassId: 'fc-2',
        fareClassCode: 'J',
        flightNumber: 'TG2',
        origin: 'NRT',
        destination: 'BKK',
        depAt: new Date('2026-12-10T10:00:00Z'),
        arrAt: new Date('2026-12-10T18:00:00Z'),
      },
    ],
    coupons: [
      coupon('coupon-1', 'bp-1', 'p1', 'seg-1', 'f2'),
      coupon('coupon-2', 'bp-2', 'p2', 'seg-1', 'f2'),
      coupon('coupon-3', 'bp-3', 'p3', 'seg-1', 'f2'),
      coupon('coupon-4', 'bp-1', 'p1', 'seg-2', 'f1'),
      coupon('coupon-5', 'bp-2', 'p2', 'seg-2', 'f1'),
      coupon('coupon-6', 'bp-3', 'p3', 'seg-2', 'f1'),
    ],
    serviceRequests: [],
    history: [],
    serverNow: NOW,
    ...overrides,
  }
}

function coupon(
  couponId: string,
  bookingPassengerId: string,
  passengerId: string,
  bookingSegmentId: string,
  flightId: string,
): BookingDetail['coupons'][number] {
  return {
    couponId,
    bookingPassengerId,
    passengerId,
    bookingSegmentId,
    flightId,
    ticketNumber: `T-${couponId}`,
    status: 'confirmed',
    cancelReason: null,
    priceTotal: 50,
    seatCode: null,
  }
}

function cancellableCoupon(
  id: string,
  bookingPassengerId: string,
  bookingSegmentId: string,
  flightId: string,
  checkIn: Array<{ status: string }> = [],
) {
  return { id, flight_id: flightId, booking_passenger_id: bookingPassengerId, booking_segment_id: bookingSegmentId, check_in: checkIn }
}

function makeHarness() {
  let detail: BookingDetail | null = makeDetail()
  let lockStatus = 'confirmed'
  let lockExists = true
  let blockingCheckIn: unknown = null
  let coupons = [
    cancellableCoupon('coupon-1', 'bp-1', 'seg-1', 'f2'),
    cancellableCoupon('coupon-2', 'bp-2', 'seg-1', 'f2'),
    cancellableCoupon('coupon-3', 'bp-3', 'seg-1', 'f2'),
    cancellableCoupon('coupon-4', 'bp-1', 'seg-2', 'f1'),
    cancellableCoupon('coupon-5', 'bp-2', 'seg-2', 'f1'),
    cancellableCoupon('coupon-6', 'bp-3', 'seg-2', 'f1'),
  ]

  const booking = {
    id: BOOKING_ID,
    payment_type: 'cash',
    booking_passenger: [
      { id: 'bp-1', passenger_type: 'adult' },
      { id: 'bp-2', passenger_type: 'child' },
      { id: 'bp-3', passenger_type: 'infant' },
    ],
    booking_segment: [
      { id: 'seg-1', flight_id: 'f2', cabin: 'economy' },
      { id: 'seg-2', flight_id: 'f1', cabin: 'business' },
    ],
  }

  const tx = {
    $queryRaw: jest.fn(() => Promise.resolve(lockExists ? [{ id: BOOKING_ID, status: lockStatus }] : [])),
    booking: {
      findUniqueOrThrow: jest.fn(() => Promise.resolve(booking)),
      update: jest.fn().mockResolvedValue({}),
    },
    booking_coupon: {
      findMany: jest.fn(() => Promise.resolve(coupons)),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  }

  const db = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    check_in: { findFirst: jest.fn(() => Promise.resolve(blockingCheckIn)) },
  }

  const read = { getBookingForUser: jest.fn(() => Promise.resolve(detail)) }
  const release = {
    releaseBooking: jest.fn().mockResolvedValue({ bookingId: BOOKING_ID, reference: REFERENCE, status: 'expired' }),
  }
  const inventory = {
    lock: jest.fn().mockResolvedValue(undefined),
    returnSold: jest.fn().mockResolvedValue(undefined),
  }
  const seats = { releaseForBooking: jest.fn().mockResolvedValue(undefined) }
  const pricing = {
    cancelQuote: jest.fn().mockResolvedValue({ currency: 'USD', fee: 100, refund: 20 }),
  }
  const refunds = { record: jest.fn().mockResolvedValue(undefined) }
  const events = { publish: jest.fn().mockResolvedValue(undefined) }
  const clock = { now: () => NOW }

  const service = new CancelService(
    db as never,
    read as never,
    new BookingStatusService(clock),
    release as never,
    clock,
    inventory as never,
    seats as never,
    pricing as never,
    refunds,
    events as never,
  )

  return {
    service,
    db,
    tx,
    read,
    release,
    inventory,
    seats,
    pricing,
    refunds,
    events,
    setDetail: (next: BookingDetail | null) => {
      detail = next
    },
    setStoredPaymentType: (paymentType: string) => {
      booking.payment_type = paymentType
    },
    setLockStatus: (status: string) => {
      lockStatus = status
    },
    setLockExists: (exists: boolean) => {
      lockExists = exists
    },
    setBlockingCheckIn: (checkIn: unknown) => {
      blockingCheckIn = checkIn
    },
    setCoupons: (next: typeof coupons) => {
      coupons = next
    },
  }
}

describe('CancelService.getPreview', () => {
  it('returns the fee and refund supplied by Feature 4 for a confirmed booking', async () => {
    const h = makeHarness()

    const result = await h.service.getPreview(REFERENCE, 'user-1')

    expect(h.read.getBookingForUser).toHaveBeenCalledWith(REFERENCE, 'user-1')
    expect(h.db.check_in.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['checked_in', 'boarded', 'no_show'] },
          booking_coupon: { booking_id: BOOKING_ID, status: 'confirmed' },
        }),
      }),
    )
    expect(h.pricing.cancelQuote).toHaveBeenCalledWith({ bookingId: BOOKING_ID, couponIds: COUPON_IDS })
    expect(result).toEqual({ fee: 100, refund: 20, currency: 'USD', milesReturned: null })
  })

  it('shows a zero fee and refund for a held booking', async () => {
    const h = makeHarness()
    h.setDetail(makeDetail({ status: 'held' }))

    const result = await h.service.getPreview(REFERENCE, 'user-1')

    expect(result).toEqual({ fee: 0, refund: 0, currency: 'USD', milesReturned: null })
    expect(h.pricing.cancelQuote).not.toHaveBeenCalled()
    expect(h.db.check_in.findFirst).not.toHaveBeenCalled()
  })

  it('returns 409 BOOKING_CLOSED once a passenger has checked in', async () => {
    const h = makeHarness()
    h.setBlockingCheckIn({ status: 'checked_in', flight_id: 'f2', booking_coupon: { id: 'coupon-1' } })

    await expect(h.service.getPreview(REFERENCE, 'user-1')).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
      status: 409,
      details: { status: 'checked_in', couponId: 'coupon-1', flightId: 'f2' },
    })
    expect(h.pricing.cancelQuote).not.toHaveBeenCalled()
  })

  it('returns 409 INVALID_BOOKING_STATE for a closed booking', async () => {
    const h = makeHarness()
    h.setDetail(makeDetail({ status: 'expired' }))

    await expect(h.service.getPreview(REFERENCE, 'user-1')).rejects.toMatchObject({
      code: 'INVALID_BOOKING_STATE',
      status: 409,
    })
  })

  it('returns 404 for a booking the caller does not own', async () => {
    const h = makeHarness()
    h.setDetail(null)

    await expect(h.service.getPreview(REFERENCE, 'other-user')).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('CancelService.cancelBooking', () => {
  it('cancels a confirmed booking and returns the seats, then records the refund and publishes', async () => {
    const h = makeHarness()

    const result = await h.service.cancelBooking(REFERENCE, 'user-1')

    const keys = [
      { flightId: 'f1', cabin: 'business' },
      { flightId: 'f2', cabin: 'economy' },
    ]
    expect(h.inventory.lock).toHaveBeenCalledWith(h.tx, keys)
    expect(h.inventory.returnSold).toHaveBeenCalledWith(h.tx, keys, 2, false)
    expect(h.seats.releaseForBooking).toHaveBeenCalledWith(h.tx, BOOKING_ID, NOW)
    expect(h.tx.booking.update).toHaveBeenCalledWith({
      where: { id: BOOKING_ID },
      data: expect.objectContaining({ status: 'cancelled', cancelled_at: NOW }),
    })
    expect(h.tx.booking_coupon.updateMany).toHaveBeenCalledWith({
      where: { booking_id: BOOKING_ID, status: 'confirmed' },
      data: expect.objectContaining({ status: 'cancelled', cancel_reason: 'customer_request' }),
    })
    expect(h.refunds.record).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      amount: 20,
      currency: 'USD',
      reason: 'customer_request',
    })
    expect(h.events.publish).toHaveBeenCalledWith({
      type: 'booking.cancelled',
      bookingId: BOOKING_ID,
      reference: REFERENCE,
      customerId: 'customer-1',
      flightIds: ['f2', 'f1'],
      occurredAt: NOW,
      cancelReason: 'customer_request',
    })
    expect(result).toEqual({
      reference: REFERENCE,
      status: 'cancelled',
      fee: 100,
      refund: 20,
      currency: 'USD',
      milesReturned: null,
    })
  })

  it('releases a held booking without pricing, refunding or publishing', async () => {
    const h = makeHarness()
    h.setDetail(makeDetail({ status: 'held' }))

    const result = await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.release.releaseBooking).toHaveBeenCalledWith(REFERENCE)
    expect(h.pricing.cancelQuote).not.toHaveBeenCalled()
    expect(h.db.$transaction).not.toHaveBeenCalled()
    expect(h.refunds.record).not.toHaveBeenCalled()
    expect(h.events.publish).not.toHaveBeenCalled()
    expect(result).toEqual({
      reference: REFERENCE,
      status: 'expired',
      fee: 0,
      refund: 0,
      currency: 'USD',
      milesReturned: null,
    })
  })

  it('passes the award flag to inventory for a miles booking', async () => {
    const h = makeHarness()
    h.setDetail(makeDetail({ paymentType: 'miles' }))
    h.setStoredPaymentType('miles')

    const result = await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.inventory.returnSold).toHaveBeenCalledWith(
      h.tx,
      [
        { flightId: 'f1', cabin: 'business' },
        { flightId: 'f2', cabin: 'economy' },
      ],
      2,
      true,
    )
    expect(h.refunds.record).toHaveBeenCalledWith(expect.objectContaining({ amount: 20 }))
    expect(result.milesReturned).toBeNull()
  })

  it('refuses cancellation before touching inventory when a passenger already checked in', async () => {
    const h = makeHarness()
    h.setBlockingCheckIn({ status: 'boarded', flight_id: 'f2', booking_coupon: { id: 'coupon-1' } })

    await expect(h.service.cancelBooking(REFERENCE, 'user-1')).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
      status: 409,
      details: { status: 'boarded', couponId: 'coupon-1', flightId: 'f2' },
    })
    expect(h.db.$transaction).not.toHaveBeenCalled()
    expect(h.inventory.lock).not.toHaveBeenCalled()
  })

  it('refuses the race where check-in lands between the early guard and the transaction', async () => {
    const h = makeHarness()
    h.setCoupons([
      cancellableCoupon('coupon-1', 'bp-1', 'seg-1', 'f2', [{ status: 'no_show' }]),
      cancellableCoupon('coupon-4', 'bp-1', 'seg-2', 'f1'),
    ])

    await expect(h.service.cancelBooking(REFERENCE, 'user-1')).rejects.toMatchObject({
      code: 'BOOKING_CLOSED',
      details: { status: 'no_show', couponId: 'coupon-1', flightId: 'f2' },
    })
    expect(h.inventory.lock).not.toHaveBeenCalled()
    expect(h.tx.booking_coupon.updateMany).not.toHaveBeenCalled()
  })

  it('is idempotent for an already cancelled booking', async () => {
    const h = makeHarness()
    h.setDetail(makeDetail({ status: 'cancelled' }))

    const result = await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.db.$transaction).not.toHaveBeenCalled()
    expect(h.refunds.record).not.toHaveBeenCalled()
    expect(result).toEqual({
      reference: REFERENCE,
      status: 'cancelled',
      fee: 0,
      refund: 0,
      currency: 'USD',
      milesReturned: null,
    })
  })

  it('does not repeat side effects when another request closed the booking first', async () => {
    const h = makeHarness()
    h.setLockStatus('expired')

    const result = await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.refunds.record).not.toHaveBeenCalled()
    expect(h.events.publish).not.toHaveBeenCalled()
    expect(result.status).toBe('expired')
    expect(result.fee).toBe(0)
    expect(result.refund).toBe(0)
  })

  it('skips the refund record when Feature 4 returns no refundable amount', async () => {
    const h = makeHarness()
    h.pricing.cancelQuote.mockResolvedValueOnce({ currency: 'USD', fee: 100, refund: 0 })

    await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.refunds.record).not.toHaveBeenCalled()
    expect(h.events.publish).toHaveBeenCalled()
  })

  it('returns seats per cabin when the legs carry different passenger counts', async () => {
    const h = makeHarness()
    h.setCoupons([
      cancellableCoupon('coupon-1', 'bp-1', 'seg-1', 'f2'),
      cancellableCoupon('coupon-2', 'bp-2', 'seg-1', 'f2'),
      cancellableCoupon('coupon-3', 'bp-3', 'seg-1', 'f2'),
      cancellableCoupon('coupon-4', 'bp-1', 'seg-2', 'f1'),
    ])

    await h.service.cancelBooking(REFERENCE, 'user-1')

    expect(h.inventory.returnSold).toHaveBeenNthCalledWith(1, h.tx, [{ flightId: 'f1', cabin: 'business' }], 1, false)
    expect(h.inventory.returnSold).toHaveBeenNthCalledWith(2, h.tx, [{ flightId: 'f2', cabin: 'economy' }], 2, false)
  })

  it('returns 404 for a booking the caller does not own', async () => {
    const h = makeHarness()
    h.setDetail(null)

    await expect(h.service.cancelBooking(REFERENCE, 'other-user')).rejects.toBeInstanceOf(NotFoundException)
    expect(h.release.releaseBooking).not.toHaveBeenCalled()
  })
})
