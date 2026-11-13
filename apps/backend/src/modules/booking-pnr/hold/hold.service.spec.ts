import 'reflect-metadata'
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { passenger } from '@backend/db/generated/prisma/client'
import type { InventoryPort, PricingPort, SeatPort } from '../contracts'
import { HoldBookingDto } from './dto/hold-booking.dto'
import { HoldService } from './hold.service'
import { ageOn, type HoldFlight, validateHoldFlights, validateHoldPassengers } from './hold.validation'

const now = new Date('2026-11-09T08:00:00Z')
const flight = {
  id: 'flight',
  status: 'scheduled',
  service_date: new Date('2026-11-10T00:00:00Z'),
  dep_at: new Date('2026-11-10T08:00:00Z'),
  scheduled_arr_at: new Date('2026-11-10T10:00:00Z'),
  route: { origin: 'BKK', destination: 'HKT' },
} as HoldFlight
const request: HoldBookingDto = {
  tripType: 'one_way',
  paymentType: 'cash',
  passengers: [{ passengerId: 'adult', passengerType: 'adult' }],
  segments: [{ flightId: 'flight', cabin: 'economy', fareClassId: 'fare' }],
  contactEmail: 'test@example.com',
  expectedTotal: 148.5,
}
const adults = [{ id: 'adult', date_of_birth: new Date('1990-01-01') }] as passenger[]
function fixture() {
  const created = { id: 'booking', booking_reference: 'ABC234', currency: 'THB', hold_expires_at: new Date(now.getTime() + 900000) }
  const tx = {
    $executeRaw: jest.fn(() => Promise.resolve(1)),
    booking: { findUnique: jest.fn(() => Promise.resolve(null as unknown)), create: jest.fn(() => Promise.resolve(created)) },
    booking_coupon: {
      aggregate: jest.fn(() => Promise.resolve({ _sum: { price_total: 148.5 } })),
      createMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    booking_passenger: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    booking_segment: { createMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    flight: { findMany: jest.fn(() => Promise.resolve([flight])) },
    passenger: { findMany: jest.fn(() => Promise.resolve(adults)) },
    fare_class: { findMany: jest.fn(() => Promise.resolve([{ id: 'fare', cabin: 'economy' }])) },
  }
  const db = {
    staff: { findFirst: jest.fn(() => Promise.resolve({ id: 'staff-agent' } as { id: string } | null)) },
    customer: { findFirst: jest.fn(() => Promise.resolve({ id: 'customer' } as { id: string } | null)) },
    $transaction: jest.fn((fn: (value: typeof tx) => unknown) => fn(tx)),
  }
  const inventory = { lock: jest.fn(() => Promise.resolve()), hold: jest.fn(() => Promise.resolve()) }
  const pricing = {
    quote: jest.fn(() => Promise.resolve({ currency: 'THB', fareClassId: 'fare', fareQuoteId: null, pricePerPassenger: 148.5 })),
  }
  const seats = { holdForBooking: jest.fn(() => Promise.resolve()) }
  const requests = { createForHold: jest.fn(() => Promise.resolve()) }
  const service = new HoldService(
    db as unknown as DbService,
    inventory as unknown as InventoryPort,
    pricing as unknown as PricingPort,
    seats as unknown as SeatPort,
    requests,
    { now: () => now },
  )
  return { service, db, tx, inventory, pricing, seats, requests, created }
}

describe('HoldService', () => {
  it('holds for the selected customer and records the authenticated staff member', async () => {
    const { service, db, tx } = fixture()
    await service.createForStaff('staff-user', 'target-customer', 'staff-key', request)
    expect(db.staff.findFirst).toHaveBeenCalledWith({
      where: { user_id: 'staff-user', deleted_at: null, user: { type: 'staff', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'target-customer', deleted_at: null, user: { type: 'customer', deleted_at: null, disabled_at: null } },
      select: { id: true },
    })
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customer_id: 'customer', booked_by_staff_id: 'staff-agent' }),
    })
  })

  it('denies non-staff callers before looking up the target customer or writing inventory', async () => {
    const { service, db, inventory } = fixture()
    db.staff.findFirst.mockResolvedValueOnce(null)
    await expect(service.createForStaff('customer-user', 'target', 'key', request)).rejects.toMatchObject({ status: 403 })
    expect(db.customer.findFirst).not.toHaveBeenCalled()
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('rejects an unavailable target customer without creating a hold', async () => {
    const { service, db, inventory } = fixture()
    db.customer.findFirst.mockResolvedValueOnce(null)
    await expect(service.createForStaff('staff-user', 'missing', 'key', request)).rejects.toMatchObject({ status: 404 })
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('replays a staff hold without creating another booking or changing its original staff actor', async () => {
    const { service, tx, created, inventory } = fixture()
    tx.booking.findUnique.mockResolvedValueOnce(created)
    expect(await service.createForStaff('staff-user', 'target', 'same-key', request)).toMatchObject({ reference: 'ABC234' })
    expect(tx.booking.create).not.toHaveBeenCalled()
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('creates a held PNR, coupons and a full 15-minute hold using the clock', async () => {
    const { service, tx, inventory } = fixture()
    expect(await service.createForUser('user', 'key', request)).toMatchObject({
      reference: 'ABC234',
      total: 148.5,
      holdExpiresAt: '2026-11-09T08:15:00.000Z',
    })
    expect(tx.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer_id: 'customer',
        status: 'held',
        booked_at: now,
        booked_by_staff_id: null,
        currency: 'THB',
      }),
    })
    expect(tx.booking_coupon.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ status: 'held', price_total: '148.50', passenger_id: 'adult', flight_id: 'flight' })],
    })
    expect(inventory.hold).toHaveBeenCalledWith(tx, [{ flightId: 'flight', cabin: 'economy' }], 1)
  })

  it('returns an existing booking before pricing or inventory decisions', async () => {
    const { service, tx, inventory, pricing, created } = fixture()
    tx.booking.findUnique.mockResolvedValue(created)
    expect(await service.createForUser('user', 'key', request)).toMatchObject({ reference: 'ABC234', total: 148.5 })
    expect(pricing.quote).not.toHaveBeenCalled()
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('returns PRICE_CHANGED without holding inventory or writing a booking', async () => {
    const { service, tx, inventory } = fixture()
    await expect(service.createForUser('user', 'key', { ...request, expectedTotal: 100 })).rejects.toMatchObject({
      code: 'PRICE_CHANGED',
      status: 409,
      details: { previousTotal: 100, newTotal: 148.5, currency: 'THB' },
    })
    expect(tx.booking.create).not.toHaveBeenCalled()
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('rejects quotes in different currencies before holding inventory', async () => {
    const { service, tx, inventory, pricing } = fixture()
    const nextFlight = {
      ...flight,
      id: 'flight-2',
      dep_at: new Date('2026-11-10T11:00:00Z'),
      scheduled_arr_at: new Date('2026-11-10T13:00:00Z'),
    }
    tx.flight.findMany.mockResolvedValueOnce([flight, nextFlight])
    tx.fare_class.findMany.mockResolvedValueOnce([
      { id: 'fare', cabin: 'economy' },
      { id: 'fare-2', cabin: 'economy' },
    ])
    pricing.quote
      .mockResolvedValueOnce({ currency: 'THB', fareClassId: 'fare', fareQuoteId: null, pricePerPassenger: 148.5 })
      .mockResolvedValueOnce({ currency: 'EUR', fareClassId: 'fare-2', fareQuoteId: null, pricePerPassenger: 148.5 })

    await expect(
      service.createForUser('user', 'key', {
        ...request,
        tripType: 'multi_city',
        segments: [request.segments[0], { ...request.segments[0], flightId: 'flight-2', fareClassId: 'fare-2' }],
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(inventory.hold).not.toHaveBeenCalled()
    expect(tx.booking.create).not.toHaveBeenCalled()
  })

  it('rejects currencies that are not three uppercase letters', async () => {
    const { service, inventory, pricing } = fixture()
    pricing.quote.mockResolvedValueOnce({ currency: 'thb', fareClassId: 'fare', fareQuoteId: null, pricePerPassenger: 148.5 })

    await expect(service.createForUser('user', 'key', request)).rejects.toMatchObject({ status: 422 })
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('requires the key before database work', async () => {
    const { service, db } = fixture()
    await expect(service.createForUser('user', undefined, request)).rejects.toMatchObject({ status: 400 })
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it('uses customer identity from the authenticated user, not the request', async () => {
    const { service, db } = fixture()
    await service.createForUser('signed-in-user', 'key', request)
    expect(db.customer.findFirst).toHaveBeenCalledWith({ where: { user_id: 'signed-in-user', deleted_at: null }, select: { id: true } })
  })

  it('rejects missing passenger DOB and cabin/fare mismatches before inventory writes', async () => {
    const { service, tx, inventory } = fixture()
    tx.passenger.findMany.mockResolvedValueOnce([])
    await expect(service.createForUser('user', 'key', request)).rejects.toMatchObject({ status: 422 })
    tx.fare_class.findMany.mockResolvedValueOnce([{ id: 'fare', cabin: 'business' }])
    await expect(service.createForUser('user', 'key', request)).rejects.toMatchObject({ status: 422 })
    expect(inventory.hold).not.toHaveBeenCalled()
  })

  it('reprices with promo code and passes seat/assistance references through the agreed ports', async () => {
    const { service, tx, pricing, seats, requests } = fixture()
    await service.createForUser('user', 'key', {
      ...request,
      promoCode: 'PROMO',
      seats: [{ passengerId: 'adult', flightId: 'flight', seatCode: '2A' }],
      serviceRequests: [{ passengerId: 'adult', flightId: 'flight', serviceCode: 'WCHR' }],
    })
    expect(pricing.quote).toHaveBeenCalledWith(expect.objectContaining({ promoCode: 'PROMO' }))
    expect(seats.holdForBooking).toHaveBeenCalledWith(
      tx,
      'booking',
      [expect.objectContaining({ bookingCouponId: expect.any(String), seatCode: '2A' })],
      expect.any(Date),
    )
    expect(requests.createForHold).toHaveBeenCalledWith(tx, [
      expect.objectContaining({ bookingSegmentId: expect.any(String), requestedAt: now }),
    ])
  })

  it('gives lap infants a zero-price coupon and no inventory unit', async () => {
    const { service, tx, inventory } = fixture()
    tx.passenger.findMany.mockResolvedValue([...adults, { id: 'infant', date_of_birth: new Date('2025-01-01') } as passenger])
    await service.createForUser('user', 'key', {
      ...request,
      passengers: [...request.passengers, { passengerId: 'infant', passengerType: 'infant', lapOfPassengerId: 'adult' }],
    })
    expect(inventory.hold).toHaveBeenCalledWith(tx, expect.any(Array), 1)
    expect(tx.booking_coupon.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ passenger_id: 'infant', price_total: '0.00', fare_quote_id: null })]),
    })
  })

  it('explicitly rejects deferred miles bookings', async () => {
    const { service, inventory } = fixture()
    await expect(service.createForUser('user', 'key', { ...request, paymentType: 'miles' })).rejects.toMatchObject({ status: 422 })
    expect(inventory.hold).not.toHaveBeenCalled()
  })
})

describe('Hold validation', () => {
  it.each([
    [2, '2024-11-10'],
    [1, '2024-11-11'],
    [12, '2014-11-10'],
    [11, '2014-11-11'],
  ])('calculates age %s on birthdays', (age, birth) => {
    expect(ageOn(new Date(birth), flight.service_date)).toBe(age)
  })

  it('derives the passenger type from DOB instead of trusting the submitted type', () => {
    const rows = [{ id: 'adult', date_of_birth: new Date('2020-01-01') }] as passenger[]
    expect(validateHoldPassengers(request, rows, [flight]).get('adult')).toBe('child')
  })

  it('rejects an infant turning two before the final flight', () => {
    const input = {
      ...request,
      passengers: [...request.passengers, { passengerId: 'infant', passengerType: 'infant' as const, lapOfPassengerId: 'adult' }],
    }
    const rows = [...adults, { id: 'infant', date_of_birth: new Date('2024-11-11') }] as passenger[]
    expect(() => validateHoldPassengers(input, rows, [flight, { ...flight, service_date: new Date('2026-11-12') }])).toThrow(
      'remain under two',
    )
  })

  it('rejects two infants sharing an adult and an infant assigned a seat', () => {
    const input = {
      ...request,
      passengers: [
        ...request.passengers,
        ...['baby1', 'baby2'].map((id) => ({ passengerId: id, passengerType: 'infant' as const, lapOfPassengerId: 'adult' })),
      ],
    }
    const rows = [...adults, ...['baby1', 'baby2'].map((id) => ({ id, date_of_birth: new Date('2025-01-01') }))] as passenger[]
    expect(() => validateHoldPassengers(input, rows, [flight])).toThrow()
    expect(() =>
      validateHoldPassengers(
        { ...input, passengers: input.passengers.slice(0, 2), seats: [{ passengerId: 'baby1', flightId: 'flight', seatCode: '2A' }] },
        rows,
        [flight],
      ),
    ).toThrow()
  })

  it('enforces the exact sales cutoff and blocks cancelled flights', () => {
    expect(validateHoldFlights(request, [flight], new Date('2026-11-10T07:00:00Z'))).toHaveLength(1)
    expect(() => validateHoldFlights(request, [flight], new Date('2026-11-10T07:00:00.001Z'))).toThrow('not for sale')
    expect(() => validateHoldFlights(request, [{ ...flight, status: 'cancelled' }], now)).toThrow('not for sale')
  })

  it('rejects multi-city connections with less than 60 minutes after scheduled arrival', () => {
    const next = { ...flight, id: 'next', dep_at: new Date('2026-11-10T10:59:00Z') }
    const input = {
      ...request,
      tripType: 'multi_city' as const,
      segments: [...request.segments, { ...request.segments[0], flightId: 'next' }],
    }
    expect(() => validateHoldFlights(input, [flight, next], now)).toThrow('60 minutes')
  })
})

describe('HoldBookingDto', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const valid = {
    ...request,
    passengers: [{ passengerId: id, passengerType: 'adult' }],
    segments: [{ flightId: id, cabin: 'economy', fareClassId: id }],
  }
  it('accepts the frontend request shape and rejects malformed money or nested data', async () => {
    expect(await validate(plainToInstance(HoldBookingDto, valid))).toHaveLength(0)
    expect(await validate(plainToInstance(HoldBookingDto, { ...valid, expectedTotal: 1.001 }))).not.toHaveLength(0)
    expect(await validate(plainToInstance(HoldBookingDto, { ...valid, passengers: [{ passengerId: 'bad' }] }))).not.toHaveLength(0)
  })
})
