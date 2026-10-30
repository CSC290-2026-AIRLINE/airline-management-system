import { BadGatewayException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { FareClassService } from '../fare-class/fare-class.service'
import { PricingRuleService } from '../pricing-rule/pricing-rule.service'
import type { PromoCodeService } from '../promo-code/promo-code.service'
import type { SeatFeeService } from '../seat-fee/seat-fee.service'
import type { SettingService } from '../setting/setting.service'
import type { TaxFeeService } from '../tax-fee/tax-fee.service'
import { FareQuoteService } from './fare-quote.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const FLIGHT_ID = '11111111-1111-1111-1111-111111111111'
const CLASS_ID = '22222222-2222-2222-2222-222222222222'
const PROMO_ID = '33333333-3333-3333-3333-333333333333'
const QUOTE_ID = '44444444-4444-4444-4444-444444444444'
const NOW = new Date('2026-10-06T05:00:00.000Z') // 12:00 in Bangkok

const flight = {
  id: FLIGHT_ID,
  route_id: 'route-1',
  dep_at: new Date('2026-10-13T05:00:00.000Z'),
  status: 'scheduled',
  route: { airport_route_originToairport: { timezone: 'Asia/Bangkok' } },
}

const fareClass = {
  id: CLASS_ID,
  code: 'M',
  cabin: 'economy',
  is_active: true,
  min_advance_purchase_days: 0,
  refundable: true,
  changeable: true,
  cancel_fee_flat: '20.00',
  cancel_fee_pct: '10.00',
  change_fee_flat: '25.00',
  change_fee_pct: '0.00',
}

const rule = (id: string, group: string, name: string, conditions: object, pct: number) => ({
  id,
  rule_group: group,
  name,
  priority: 1,
  min_days_out: null,
  max_days_out: null,
  min_seats_left_pct: null,
  max_seats_left_pct: null,
  month: null,
  start_date: null,
  end_date: null,
  fare_class_id: null,
  adjustment_pct: String(pct),
  is_active: true,
  ...conditions,
})

const RULES = [
  rule('h7', 'urgency', 'H-7', { min_days_out: 4, max_days_out: 7 }, 10),
  rule('full', 'load', 'Almost full', { max_seats_left_pct: '20' }, 15),
]
const VAT = { id: 'vat', name: 'VAT', kind: 'tax', calc_type: 'pct', value: '7.00' }
const PROMO = { id: PROMO_ID, code: 'SAVE10', discount_pct: '10.00', discount_amount: null }

// Every Nest HTTP exception has getResponse(); the tests check its type separately with toBeInstanceOf.
async function errorOf(promise: Promise<unknown>): Promise<NotFoundException> {
  try {
    await promise
  } catch (error) {
    return error as NotFoundException
  }
  throw new Error('Expected the call to be rejected')
}

describe('FareQuoteService', () => {
  const tx = {
    $executeRaw: jest.fn(),
    fare_quote: { findFirst: jest.fn(), create: jest.fn() },
  }
  const db = {
    flight: { findUnique: jest.fn() },
    base_fare: { findFirst: jest.fn() },
    pricing_rule: { findMany: jest.fn() },
    fare_quote: { findFirst: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  }
  const fareClasses = { findOne: jest.fn() }
  const promoCodes = { checkPromo: jest.fn() }
  const seatFees = { lookup: jest.fn() }
  const taxFees = { findAll: jest.fn() }
  const settings = { getBaseCurrency: jest.fn(), getQuoteHoldMinutes: jest.fn() }
  const seats = { seatsLeftPct: jest.fn() }
  let service: FareQuoteService

  const dto = { flight_id: FLIGHT_ID, fare_class_id: CLASS_ID }

  // The row the mocked insert was given, as the database would return it.
  const savedData = () => (tx.fare_quote.create.mock.calls[0][0] as { data: Record<string, any> }).data
  const savedLines = () => savedData().fare_quote_line.create as { seq: number; kind: string; amount: number; rate_pct: number | null }[]

  beforeEach(() => {
    jest.resetAllMocks()
    jest.useFakeTimers({ now: NOW })
    db.flight.findUnique.mockResolvedValue(flight)
    fareClasses.findOne.mockResolvedValue(fareClass)
    db.fare_quote.findFirst.mockResolvedValue(null)
    tx.fare_quote.findFirst.mockResolvedValue(null)
    tx.fare_quote.create.mockImplementation(({ data }: { data: { fare_quote_line: { create: unknown[] } } }) =>
      Promise.resolve({ ...data, id: QUOTE_ID, fare_quote_line: data.fare_quote_line.create }),
    )
    db.$transaction.mockImplementation((work: (client: typeof tx) => Promise<unknown>) => work(tx))
    seats.seatsLeftPct.mockResolvedValue(15)
    db.base_fare.findFirst.mockResolvedValue({ amount: '100.00' })
    db.pricing_rule.findMany.mockResolvedValue(RULES)
    taxFees.findAll.mockResolvedValue([VAT])
    settings.getBaseCurrency.mockResolvedValue('THB')
    settings.getQuoteHoldMinutes.mockResolvedValue(15)
    promoCodes.checkPromo.mockResolvedValue(PROMO)
    service = new FareQuoteService(
      db as unknown as DbService,
      fareClasses as unknown as FareClassService,
      new PricingRuleService(db as unknown as DbService),
      promoCodes as unknown as PromoCodeService,
      seatFees as unknown as SeatFeeService,
      taxFees as unknown as TaxFeeService,
      settings as unknown as SettingService,
      seats,
    )
  })

  afterEach(() => jest.useRealTimers())

  describe('the worked example', () => {
    it('gives exactly 121.82, line by line, through the real rule engine', async () => {
      const quote = await service.create({ ...dto, promo_code: 'SAVE10' })

      expect(savedLines().map(({ seq, kind, amount, rate_pct }) => ({ seq, kind, amount, rate_pct }))).toEqual([
        { seq: 1, kind: 'base', amount: 100, rate_pct: null },
        { seq: 2, kind: 'rule', amount: 10, rate_pct: 10 },
        { seq: 3, kind: 'rule', amount: 16.5, rate_pct: 15 },
        { seq: 4, kind: 'promo', amount: -12.65, rate_pct: 10 },
        { seq: 5, kind: 'tax', amount: 7.97, rate_pct: 7 },
      ])
      expect(quote.total_amount).toBe(121.82)
    })

    it('adds up to the total exactly', async () => {
      await service.create({ ...dto, promo_code: 'SAVE10' })

      const sum = savedLines().reduce((cents, line) => cents + Math.round(line.amount * 100), 0)
      expect(sum).toBe(12182)
    })

    it('renames the lines relation to `lines` in the response', async () => {
      const quote = await service.create(dto)

      expect(quote.lines).toHaveLength(4)
      expect(quote).not.toHaveProperty('fare_quote_line')
    })
  })

  describe('what is saved', () => {
    it('freezes the inputs, the currency and the window', async () => {
      await service.create({ ...dto, seat_type: undefined })

      expect(savedData()).toMatchObject({
        flight_id: FLIGHT_ID,
        fare_class_id: CLASS_ID,
        promo_code_id: null,
        seat_type: null,
        currency: 'THB',
        seats_left_pct: 15,
        days_to_departure: 7,
        quoted_at: NOW,
        expires_at: new Date('2026-10-06T05:15:00.000Z'),
      })
    })

    it('freezes the fare rules as plain values, without the id or the name', async () => {
      await service.create(dto)

      expect(savedData().fare_rule_snapshot).toEqual({
        min_advance_purchase_days: 0,
        refundable: true,
        changeable: true,
        cancel_fee_flat: 20,
        cancel_fee_pct: 10,
        change_fee_flat: 25,
        change_fee_pct: 0,
      })
    })

    it('saves the quote and its lines in one transaction, under a lock on the quote key', async () => {
      await service.create(dto)

      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.fare_quote.create.mock.invocationCallOrder[0])
    })

    it('looks up the seat fee for the cabin of the fare class', async () => {
      seatFees.lookup.mockResolvedValue({ amount: '12.00' })

      await service.create({ ...dto, seat_type: 'exit_row' })

      expect(seatFees.lookup).toHaveBeenCalledWith('economy', 'exit_row')
      expect(savedLines().find((line) => line.kind === 'seat_fee')?.amount).toBe(12)
      expect(savedData().seat_type).toBe('exit_row')
    })

    it('passes the seats left and the local departure date to the rules', async () => {
      const applyRules = jest.spyOn(PricingRuleService.prototype, 'applyRules')

      await service.create(dto)

      expect(applyRules).toHaveBeenCalledWith(100, {
        fareClassId: CLASS_ID,
        daysToDeparture: 7,
        seatsLeftPct: 15,
        departureDate: '2026-10-13',
      })
      applyRules.mockRestore()
    })
  })

  describe('flight checks', () => {
    it('throws FLIGHT_NOT_FOUND for an unknown flight', async () => {
      db.flight.findUnique.mockResolvedValue(null)

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ code: 'FLIGHT_NOT_FOUND' })
    })

    it.each(['cancelled', 'departed', 'arrived', 'holding', 'diverted'])('refuses a %s flight', async (status) => {
      db.flight.findUnique.mockResolvedValue({ ...flight, status })

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(ConflictException)
      expect(error.getResponse()).toMatchObject({ code: 'FLIGHT_NOT_BOOKABLE', details: { status } })
    })

    it('sells a delayed flight', async () => {
      db.flight.findUnique.mockResolvedValue({ ...flight, status: 'delayed' })

      await expect(service.create(dto)).resolves.toBeDefined()
    })

    it('refuses a flight whose departure time has passed, even if nobody updated its status', async () => {
      db.flight.findUnique.mockResolvedValue({ ...flight, dep_at: new Date('2026-10-06T04:59:00.000Z') })

      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('fare class checks', () => {
    it('throws FARE_CLASS_NOT_FOUND for an inactive class', async () => {
      fareClasses.findOne.mockResolvedValue({ ...fareClass, is_active: false })

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ code: 'FARE_CLASS_NOT_FOUND' })
    })

    it('refuses a class bought too close to departure', async () => {
      fareClasses.findOne.mockResolvedValue({ ...fareClass, min_advance_purchase_days: 14 })

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({
        code: 'ADVANCE_PURCHASE_REQUIRED',
        details: { min_advance_purchase_days: 14, days_to_departure: 7 },
      })
    })

    it('allows the purchase on exactly the last day', async () => {
      fareClasses.findOne.mockResolvedValue({ ...fareClass, min_advance_purchase_days: 7 })

      await expect(service.create(dto)).resolves.toBeDefined()
    })
  })

  describe('days to departure', () => {
    // 25 hours apart, so hours ÷ 24 would say 1. In Tokyo it is 23:30 on the 6th and the flight leaves at 00:30 on the 8th.
    const now = new Date('2026-10-06T14:30:00.000Z')
    const depAt = new Date('2026-10-07T15:30:00.000Z')

    beforeEach(() => jest.setSystemTime(now))

    it('counts calendar dates in the origin timezone, across midnight', async () => {
      db.flight.findUnique.mockResolvedValue({
        ...flight,
        dep_at: depAt,
        route: { airport_route_originToairport: { timezone: 'Asia/Tokyo' } },
      })

      await service.create(dto)

      expect(savedData().days_to_departure).toBe(2)
    })

    it('gives a different answer for the same moments in another timezone', async () => {
      db.flight.findUnique.mockResolvedValue({
        ...flight,
        dep_at: depAt,
        route: { airport_route_originToairport: { timezone: 'America/New_York' } },
      })

      await service.create(dto)

      expect(savedData().days_to_departure).toBe(1)
    })

    it('uses the local date for month and period rules', async () => {
      db.flight.findUnique.mockResolvedValue({
        ...flight,
        dep_at: new Date('2026-10-31T16:00:00.000Z'), // already 1 Nov in Tokyo
        route: { airport_route_originToairport: { timezone: 'Asia/Tokyo' } },
      })
      db.pricing_rule.findMany.mockResolvedValue([rule('nov', 'month', 'November', { month: 11 }, 20)])
      taxFees.findAll.mockResolvedValue([])

      const quote = await service.create(dto)

      expect(quote.total_amount).toBe(120)
    })
  })

  describe('promo', () => {
    it('passes the typed code and the simulation time to checkPromo', async () => {
      await service.create({ ...dto, promo_code: 'save10' })

      expect(promoCodes.checkPromo).toHaveBeenCalledWith('save10', NOW)
      expect(savedData().promo_code_id).toBe(PROMO_ID)
    })

    it('lets a PROMO_INVALID error through', async () => {
      const invalid = new UnprocessableEntityException({ code: 'PROMO_INVALID' })
      promoCodes.checkPromo.mockRejectedValue(invalid)

      await expect(service.create({ ...dto, promo_code: 'NOPE' })).rejects.toBe(invalid)
      expect(tx.fare_quote.create).not.toHaveBeenCalled()
    })
  })

  describe('other failures', () => {
    it('throws BASE_FARE_MISSING when the class is not priced on this route', async () => {
      db.base_fare.findFirst.mockResolvedValue(null)

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({ code: 'BASE_FARE_MISSING' })
    })

    it('only uses a live base fare', async () => {
      await service.create(dto)

      expect(db.base_fare.findFirst).toHaveBeenCalledWith({ where: { route_id: 'route-1', fare_class_id: CLASS_ID, deleted_at: null } })
    })

    it('throws UPSTREAM_UNAVAILABLE when seat availability fails', async () => {
      seats.seatsLeftPct.mockRejectedValue(new Error('connection refused'))

      const error = await errorOf(service.create(dto))

      expect(error).toBeInstanceOf(BadGatewayException)
      expect(error.getResponse()).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' })
    })

    it.each([-1, 101, Number.NaN])('refuses a nonsense seats-left answer of %s', async (value) => {
      seats.seatsLeftPct.mockResolvedValue(value)

      await expect(service.create(dto)).rejects.toBeInstanceOf(BadGatewayException)
      expect(tx.fare_quote.create).not.toHaveBeenCalled()
    })

    it('saves nothing when a chosen seat type has no fee row', async () => {
      seatFees.lookup.mockRejectedValue(new NotFoundException({ code: 'SEAT_FEE_NOT_FOUND' }))

      await expect(service.create({ ...dto, seat_type: 'exit_row' })).rejects.toBeInstanceOf(NotFoundException)
      expect(tx.fare_quote.create).not.toHaveBeenCalled()
    })
  })

  describe('reusing a live quote', () => {
    const live = { id: QUOTE_ID, total_amount: '121.82', fare_quote_line: [{ seq: 1 }] }

    it('returns the same quote inside the window and calculates nothing', async () => {
      db.fare_quote.findFirst.mockResolvedValue(live)

      const quote = await service.create(dto)

      expect(quote.id).toBe(QUOTE_ID)
      expect(seats.seatsLeftPct).not.toHaveBeenCalled()
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('matches empty promo and seat type as null, inside the window on both sides', async () => {
      await service.create(dto)

      expect(db.fare_quote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            flight_id: FLIGHT_ID,
            fare_class_id: CLASS_ID,
            promo_code_id: null,
            seat_type: null,
            quoted_at: { lte: NOW },
            expires_at: { gt: NOW },
          },
        }),
      )
    })

    it('keys on the promo id and the seat type', async () => {
      seatFees.lookup.mockResolvedValue({ amount: '12.00' })

      await service.create({ ...dto, promo_code: 'SAVE10', seat_type: 'exit_row' })

      expect(db.fare_quote.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ promo_code_id: PROMO_ID, seat_type: 'exit_row' }) }),
      )
    })

    it('makes a new quote once the old one has expired', async () => {
      db.fare_quote.findFirst.mockResolvedValue(null) // the window filter excludes the expired row

      await service.create(dto)

      expect(tx.fare_quote.create).toHaveBeenCalledTimes(1)
    })

    it('returns the winner when an identical request saved first', async () => {
      tx.fare_quote.findFirst.mockResolvedValue(live)

      const quote = await service.create(dto)

      expect(quote.id).toBe(QUOTE_ID)
      expect(tx.fare_quote.create).not.toHaveBeenCalled()
    })

    it.each<[string, () => void]>([
      ['the flight was cancelled', () => db.flight.findUnique.mockResolvedValue({ ...flight, status: 'cancelled' })],
      ['the class was switched off', () => fareClasses.findOne.mockResolvedValue({ ...fareClass, is_active: false })],
      ['the promo stopped working', () => promoCodes.checkPromo.mockRejectedValue(new UnprocessableEntityException())],
    ])('does not reuse a live quote when %s', async (_label, change) => {
      db.fare_quote.findFirst.mockResolvedValue(live)
      change()

      await expect(service.create({ ...dto, promo_code: 'SAVE10' })).rejects.toBeDefined()
    })
  })

  describe('reading a quote', () => {
    const stored = {
      id: QUOTE_ID,
      total_amount: '121.82',
      currency: 'THB',
      fare_rule_snapshot: {
        refundable: true,
        changeable: false,
        cancel_fee_flat: 20,
        cancel_fee_pct: 10,
        change_fee_flat: 25,
        change_fee_pct: 0,
      },
      fare_quote_line: [{ seq: 1 }],
    }

    it('throws FARE_QUOTE_NOT_FOUND for an unknown id', async () => {
      db.fare_quote.findUnique.mockResolvedValue(null)

      const error = await errorOf(service.findOne(QUOTE_ID))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ code: 'FARE_QUOTE_NOT_FOUND' })
    })

    it('returns the lines in order', async () => {
      db.fare_quote.findUnique.mockResolvedValue(stored)

      const quote = await service.findOne(QUOTE_ID)

      expect(quote.lines).toEqual([{ seq: 1 }])
      expect(db.fare_quote.findUnique).toHaveBeenCalledWith({
        where: { id: QUOTE_ID },
        include: { fare_quote_line: { orderBy: { seq: 'asc' } } },
      })
    })

    it('works out the fee from the frozen snapshot, and never reads the live fare class', async () => {
      db.fare_quote.findUnique.mockResolvedValue(stored)

      const fee = await service.fee(QUOTE_ID, 'cancel')

      expect(fee).toEqual({
        fare_quote_id: QUOTE_ID,
        type: 'cancel',
        allowed: true,
        flat: 20,
        pct: 10,
        fee: 32.18, // 20.00 + 10% of 121.82
        currency: 'THB',
      })
      expect(fareClasses.findOne).not.toHaveBeenCalled()
    })

    it('gives no fee when the action is not allowed', async () => {
      db.fare_quote.findUnique.mockResolvedValue(stored)

      await expect(service.fee(QUOTE_ID, 'change')).resolves.toMatchObject({ allowed: false, fee: null })
    })

    it('caps the fee at the quote total', async () => {
      db.fare_quote.findUnique.mockResolvedValue({ ...stored, total_amount: '10.00' })

      await expect(service.fee(QUOTE_ID, 'cancel')).resolves.toMatchObject({ fee: 10 })
    })
  })
})
