import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import type { DbService } from '@backend/db/db.service'
import { ParseCurrencyCodePipe } from './currency-code.pipe'
import { CurrencyRateService } from './currency-rate.service'
import { CreateCurrencyRateDto } from './dto/create-currency-rate.dto'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'
const eur = { currency_code: 'EUR', rate_per_base: 0.92, updated_by: STAFF_ID }

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

  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    service = new CurrencyRateService(db as unknown as DbService)
  })

  it('lists the rate table by code', async () => {
    db.currency_rate.findMany.mockResolvedValue([eur])

    await expect(service.findAll()).resolves.toEqual([eur])
    expect(db.currency_rate.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { currency_code: 'asc' } }))
  })

  it('throws CURRENCY_RATE_NOT_FOUND for an unknown code', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)

    const error = await service.findOne('JPY').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ error: { code: 'CURRENCY_RATE_NOT_FOUND' } })
  })

  describe('upsert (PUT /staff/currency-rates/:code)', () => {
    it('creates or updates by the code in the URL, stamping the staff id of the logged-in user', async () => {
      await service.upsert('EUR', { rate_per_base: 0.92 }, USER_ID)

      expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER_ID, deleted_at: null } }))
      expect(db.currency_rate.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { currency_code: 'EUR' },
          create: { currency_code: 'EUR', rate_per_base: 0.92, updated_by: STAFF_ID },
          update: { rate_per_base: 0.92, updated_by: STAFF_ID, updated_at: expect.any(Date) },
        }),
      )
    })

    it('refuses a user with no staff row', async () => {
      db.staff.findFirst.mockResolvedValue(null)

      await expect(service.upsert('EUR', { rate_per_base: 0.92 }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
      expect(db.currency_rate.upsert).not.toHaveBeenCalled()
    })

    it('refuses the base currency', async () => {
      const error = await service.upsert('USD', { rate_per_base: 1 }, USER_ID).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(BadRequestException)
      expect((error as BadRequestException).getResponse()).toMatchObject({ error: { code: 'CURRENCY_IS_BASE' } })
      expect(db.currency_rate.upsert).not.toHaveBeenCalled()
    })
  })

  describe('convert', () => {
    it('converts with the stored rate (100 USD at 0.92 = 92.00 EUR)', async () => {
      db.currency_rate.findUnique.mockResolvedValue(eur)

      await expect(service.convert(100, 'EUR')).resolves.toBe(92)
    })

    it('rounds half up to 2 decimal places', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...eur, rate_per_base: 0.125 })

      await expect(service.convert(1, 'EUR')).resolves.toBe(0.13) // 0.125 -> 0.13
      await expect(service.convert(-1, 'EUR')).resolves.toBe(-0.13)
      await expect(service.convert(0.1, 'EUR')).resolves.toBe(0.01) // 0.0125 -> 0.01
    })

    it('accepts a Prisma Decimal-like amount and rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...eur, rate_per_base: { toFixed: () => '0.920000' } })

      await expect(service.convert({ toFixed: () => '1234.560000' }, 'EUR')).resolves.toBe(1135.8) // 1135.8 exactly
    })

    it('returns the amount unchanged for the base currency without a lookup', async () => {
      await expect(service.convert(3500, 'USD')).resolves.toBe(3500)
      expect(db.currency_rate.findUnique).not.toHaveBeenCalled()
    })

    it('throws not found for a currency with no rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue(null)

      await expect(service.convert(100, 'JPY')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
