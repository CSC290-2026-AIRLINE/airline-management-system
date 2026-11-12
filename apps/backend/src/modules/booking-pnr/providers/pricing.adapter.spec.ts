import { ConflictException, HttpException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { PricingErrorCode, pricingError } from '@backend/modules/pricing/pricing.errors'
import { BookingError } from '../common/booking-error'
import { PricingAdapter } from './pricing.adapter'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const NOW = new Date('2026-11-13T00:00:00.000Z')

describe('PricingAdapter', () => {
  const create = jest.fn()
  const lookup = jest.fn()
  const checkPromo = jest.fn()
  const redeem = jest.fn()
  const db = {} as DbService
  const clock = { now: () => NOW }
  const adapter = new PricingAdapter({ create } as never, { lookup } as never, { checkPromo, redeem } as never, db, clock)

  beforeEach(() => {
    jest.resetAllMocks()
    clock.now = () => NOW
  })

  describe('quote', () => {
    it('asks Feature 4 for a quote and maps the row onto the port', async () => {
      create.mockResolvedValue({
        id: 'quote-1',
        fare_class_id: 'class-1',
        currency: 'USD',
        total_amount: '121.82',
        fare_rule_snapshot: { refundable: true, cancel_fee_flat: 20 },
        lines: [
          { kind: 'base', label: 'Base fare', amount: '100.00' },
          { kind: 'tax', label: 'VAT', amount: '21.82' },
        ],
      })

      const quote = await adapter.quote({
        flightId: 'flight-1',
        cabin: 'economy',
        fareClassId: 'class-1',
        seatType: 'exit_row',
        promoCode: 'SAVE10',
      })

      expect(create).toHaveBeenCalledWith({
        flight_id: 'flight-1',
        fare_class_id: 'class-1',
        seat_type: 'exit_row',
        promo_code: 'SAVE10',
      })
      expect(quote).toEqual({
        fareQuoteId: 'quote-1',
        fareClassId: 'class-1',
        currency: 'USD',
        pricePerPassenger: 121.82,
        fareRuleSnapshot: { refundable: true, cancel_fee_flat: 20 },
        lines: [
          { kind: 'base', label: 'Base fare', amount: 100 },
          { kind: 'tax', label: 'VAT', amount: 21.82 },
        ],
      })
    })

    it('reads the lines of a quote that still carries the fare_quote_line relation', async () => {
      create.mockResolvedValue({
        id: 'quote-2',
        fare_class_id: 'class-1',
        currency: 'USD',
        total_amount: '100.00',
        fare_rule_snapshot: null,
        fare_quote_line: [{ kind: 'base', label: 'Base fare', amount: '100.00' }],
      })

      const quote = await adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })

      expect(quote.lines).toEqual([{ kind: 'base', label: 'Base fare', amount: 100 }])
      expect(quote.fareRuleSnapshot).toBeNull()
    })
  })

  describe('seatFee', () => {
    it('looks the fee up for the cabin and seat type and returns a number', async () => {
      lookup.mockResolvedValue({ amount: '12.50' })

      await expect(adapter.seatFee({ flightId: 'flight-1', cabin: 'economy', seatType: 'exit_row' })).resolves.toBe(12.5)
      expect(lookup).toHaveBeenCalledWith('economy', 'exit_row')
    })
  })

  describe('redeem', () => {
    it('checks the code on the booking clock, then redeems it for the quote', async () => {
      checkPromo.mockResolvedValue({ id: 'promo-1', code: 'SAVE10' })
      redeem.mockResolvedValue({ status: 'redeemed' })

      await adapter.redeem('SAVE10', 'quote-1', 'ABC123')

      expect(checkPromo).toHaveBeenCalledWith('SAVE10', NOW)
      expect(redeem).toHaveBeenCalledWith('promo-1', { booking_ref: 'ABC123', fare_quote_id: 'quote-1' })
      expect(checkPromo.mock.invocationCallOrder[0]).toBeLessThan(redeem.mock.invocationCallOrder[0])
    })

    it('does not redeem anything when the code is refused', async () => {
      checkPromo.mockRejectedValue(
        new ConflictException(pricingError(PricingErrorCode.PROMO_INVALID, 'Promo code SAVE10 has expired', { reason: 'expired' })),
      )

      await expect(adapter.redeem('SAVE10', 'quote-1', 'ABC123')).rejects.toMatchObject({
        code: 'INVALID_BOOKING_STATE',
        status: 409,
        details: { pricingCode: 'PROMO_INVALID', pricingDetails: { reason: 'expired' } },
      })
      expect(redeem).not.toHaveBeenCalled()
    })
  })

  describe('the error translator', () => {
    it('rethrows a booking error as it is', async () => {
      const original = new BookingError('SEAT_UNAVAILABLE', 'No seats left.', 409)
      create.mockRejectedValue(original)

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toBe(original)
    })

    it('turns a sold-out fare class into SEAT_UNAVAILABLE', async () => {
      create.mockRejectedValue(
        new ConflictException(pricingError(PricingErrorCode.FARE_CLASS_UNAVAILABLE, 'No seats are left in this fare class')),
      )

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'SEAT_UNAVAILABLE',
        status: 409,
        message: 'No seats are left in this fare class',
        details: { pricingCode: 'FARE_CLASS_UNAVAILABLE' },
      })
    })

    it('turns a cancelled or departed flight into FLIGHT_NOT_FOR_SALE', async () => {
      create.mockRejectedValue(new ConflictException(pricingError(PricingErrorCode.FLIGHT_CANCELLED, 'This flight was cancelled')))

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'FLIGHT_NOT_FOR_SALE',
        status: 409,
        details: { pricingCode: 'FLIGHT_CANCELLED' },
      })
    })

    it('turns an expired quote into BOOKING_CLOSED', async () => {
      create.mockRejectedValue(new HttpException(pricingError(PricingErrorCode.QUOTE_EXPIRED, 'This quote has expired'), 410))

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'BOOKING_CLOSED',
        status: 409,
        details: { pricingCode: 'QUOTE_EXPIRED' },
      })
    })

    it('turns an unknown seat type into SEAT_NOT_ALLOWED', async () => {
      create.mockRejectedValue(
        new ConflictException(pricingError(PricingErrorCode.SEAT_TYPE_UNKNOWN, 'Unknown seat type exit_row', { allowed: ['standard'] })),
      )

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'SEAT_NOT_ALLOWED',
        status: 422,
        details: { pricingCode: 'SEAT_TYPE_UNKNOWN', pricingDetails: { allowed: ['standard'] } },
      })
    })

    it('keeps the status of a pricing error it has no mapping for', async () => {
      create.mockRejectedValue(new NotFoundException(pricingError(PricingErrorCode.QUOTE_NOT_FOUND, 'Fare quote quote-1 not found')))

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'INVALID_BOOKING_STATE',
        status: 404,
        message: 'Fare quote quote-1 not found',
        details: { pricingCode: 'QUOTE_NOT_FOUND' },
      })
    })

    it('translates an error that carries no pricing code at all', async () => {
      create.mockRejectedValue(new HttpException('Something went wrong', 500))

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toMatchObject({
        code: 'INVALID_BOOKING_STATE',
        status: 500,
        details: { pricingCode: 'PRICING_ERROR' },
      })
    })

    it('lets an error that is not a pricing error through', async () => {
      const original = new Error('the database is gone')
      create.mockRejectedValue(original)

      await expect(adapter.quote({ flightId: 'flight-1', cabin: 'economy', fareClassId: 'class-1' })).rejects.toBe(original)
    })
  })

  it('does not cancel a quote yet', async () => {
    await expect(adapter.cancelQuote({ bookingId: 'booking-1' })).rejects.toThrow('cancelQuote not implemented yet')
  })
})
