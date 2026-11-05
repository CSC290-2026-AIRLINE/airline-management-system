import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import type { SettingService } from '../setting/setting.service'
import { ParseCurrencyCodePipe } from './currency-code.pipe'
import { CurrencyRateService, displayFields } from './currency-rate.service'
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
// The base currency is USD (pricing_setting), so a rate is how many of a currency one dollar buys.
const thb = { currency_code: 'THB', rate_per_base: 35, updated_by: STAFF_ID }

async function errorsFor(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateCurrencyRateDto, body))
  return errors.map((e) => e.property)
}

describe('CreateCurrencyRateDto', () => {
  it('accepts a 3-letter uppercase code and a positive rate', async () => {
    expect(await errorsFor({ currency_code: 'USD', rate_per_base: 0.028 })).toEqual([])
  })

  it.each(['usd', 'US', 'USDT', 'U5D', ''])('rejects the code %p', async (code) => {
    expect(await errorsFor({ currency_code: code, rate_per_base: 0.028 })).toEqual(['currency_code'])
  })

  it.each([0, -1, 0.0000001, '0.028'])('rejects the rate %p', async (rate) => {
    expect(await errorsFor({ currency_code: 'USD', rate_per_base: rate })).toEqual(['rate_per_base'])
  })
})

describe('ParseCurrencyCodePipe', () => {
  it('passes a valid code through and rejects a malformed one with 400', () => {
    const pipe = new ParseCurrencyCodePipe()
    expect(pipe.transform('EUR')).toBe('EUR')
    expect(() => pipe.transform('eur')).toThrow(BadRequestException)
  })
})

describe('CurrencyRateService', () => {
  let service: CurrencyRateService
  const db = {
    currency_rate: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    staff: { findFirst: jest.fn() },
  }
  const settings = { getBaseCurrency: jest.fn() }

  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    settings.getBaseCurrency.mockResolvedValue('USD')
    service = new CurrencyRateService(db as unknown as DbService, settings as unknown as SettingService)
  })

  it('throws CURRENCY_RATE_NOT_FOUND for an unknown code', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)

    const error = await service.findOne('EUR').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'CURRENCY_RATE_NOT_FOUND' })
  })

  it('adds or replaces the rate in one upsert, with the logged-in staff member as updated_by', async () => {
    await service.upsert('THB', { rate_per_base: 35 }, USER_ID)

    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER_ID, deleted_at: null } }))
    expect(db.currency_rate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { currency_code: 'THB' },
        create: { currency_code: 'THB', rate_per_base: 35, updated_by: STAFF_ID },
        update: { rate_per_base: 35, updated_by: STAFF_ID, updated_at: expect.any(Date) },
      }),
    )
  })

  it('refuses a user with no staff row', async () => {
    db.staff.findFirst.mockResolvedValue(null)

    await expect(service.upsert('THB', { rate_per_base: 35 }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.currency_rate.upsert).not.toHaveBeenCalled()
  })

  it('refuses a rate for the base currency', async () => {
    const error = await service.upsert('USD', { rate_per_base: 1 }, USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'CURRENCY_IS_BASE' })
    expect(db.currency_rate.upsert).not.toHaveBeenCalled()
  })

  describe('convert', () => {
    it('converts with the stored rate (98 USD at 35 = 3,430.00 THB)', async () => {
      db.currency_rate.findUnique.mockResolvedValue(thb)

      await expect(service.convert(98, 'THB')).resolves.toBe(3430)
    })

    it('rounds half up to 2 decimal places', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...thb, rate_per_base: 0.125 })

      await expect(service.convert(1, 'THB')).resolves.toBe(0.13) // 0.125 -> 0.13
      await expect(service.convert(-1, 'THB')).resolves.toBe(-0.13)
      await expect(service.convert(0.1, 'THB')).resolves.toBe(0.01) // 0.0125 -> 0.01
    })

    it('accepts a Prisma Decimal-like amount and rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...thb, rate_per_base: { toFixed: () => '0.028000' } })

      await expect(service.convert({ toFixed: () => '1234.560000' }, 'THB')).resolves.toBe(34.57) // 34.56768
    })

    it('returns the amount unchanged for the base currency without a lookup', async () => {
      await expect(service.convert(3500, 'USD')).resolves.toBe(3500)
      expect(db.currency_rate.findUnique).not.toHaveBeenCalled()
    })

    it('throws not found for a currency with no rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue(null)

      await expect(service.convert(100, 'EUR')).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('displayRate', () => {
    it('returns the stored rate, and displayFields converts with it', async () => {
      db.currency_rate.findUnique.mockResolvedValue(thb)

      const rate = await service.displayRate('THB')

      expect(rate).toEqual({ currency: 'THB', rate_per_base: 35 })
      expect(displayFields(121.82, rate)).toEqual({ display_currency: 'THB', rate_per_base: 35, display_total_amount: 4263.7 })
      expect(db.currency_rate.upsert).not.toHaveBeenCalled()
    })

    it('uses rate 1 for the base currency without a lookup', async () => {
      await expect(service.displayRate('USD')).resolves.toEqual({ currency: 'USD', rate_per_base: 1 })
      expect(db.currency_rate.findUnique).not.toHaveBeenCalled()
    })

    it('throws 400 CURRENCY_UNKNOWN for a code with no rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue(null)

      const error = await service.displayRate('XYZ').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(BadRequestException)
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'CURRENCY_UNKNOWN' })
    })
  })
})
