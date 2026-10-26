import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
const usd = { currency_code: 'USD', rate_per_base: 0.028, updated_by: STAFF_ID }

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
    currency_rate: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    staff: { findFirst: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })
    service = new CurrencyRateService(db as unknown as DbService)
  })

  it('throws CURRENCY_RATE_NOT_FOUND for an unknown code', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)

    const error = await service.findOne('EUR').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'CURRENCY_RATE_NOT_FOUND' })
  })

  it('stores the staff id of the logged-in user as updated_by', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)

    await service.create({ currency_code: 'USD', rate_per_base: 0.028 }, USER_ID)

    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER_ID, deleted_at: null } }))
    expect(db.currency_rate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currency_code: 'USD', rate_per_base: 0.028, updated_by: STAFF_ID } }),
    )
  })

  it('refuses a user with no staff row', async () => {
    db.staff.findFirst.mockResolvedValue(null)
    db.currency_rate.findUnique.mockResolvedValue(null)

    await expect(service.create({ currency_code: 'USD', rate_per_base: 0.028 }, USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.currency_rate.create).not.toHaveBeenCalled()
  })

  it('refuses a row for the base currency', async () => {
    const error = await service.create({ currency_code: 'THB', rate_per_base: 1 }, USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'CURRENCY_IS_BASE' })
    expect(db.currency_rate.create).not.toHaveBeenCalled()
  })

  it('refuses a code that already has a rate', async () => {
    db.currency_rate.findUnique.mockResolvedValue(usd)

    const error = await service.create({ currency_code: 'USD', rate_per_base: 0.03 }, USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'CURRENCY_CODE_TAKEN' })
    expect(db.currency_rate.create).not.toHaveBeenCalled()
  })

  it('maps a unique violation from the database to a conflict', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)
    db.currency_rate.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    await expect(service.create({ currency_code: 'USD', rate_per_base: 0.028 }, USER_ID)).rejects.toBeInstanceOf(ConflictException)
  })

  it('throws not found when updating an unknown code', async () => {
    db.currency_rate.findUnique.mockResolvedValue(null)

    await expect(service.update('EUR', { rate_per_base: 0.026 }, USER_ID)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.currency_rate.update).not.toHaveBeenCalled()
  })

  it('sets updated_by and updated_at on update', async () => {
    db.currency_rate.findUnique.mockResolvedValue(usd)

    await service.update('USD', { rate_per_base: 0.029 }, USER_ID)

    expect(db.currency_rate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { currency_code: 'USD' },
        data: { rate_per_base: 0.029, updated_by: STAFF_ID, updated_at: expect.any(Date) },
      }),
    )
  })

  describe('convert', () => {
    it('converts with the stored rate (3,500 THB at 0.028 = 98.00 USD)', async () => {
      db.currency_rate.findUnique.mockResolvedValue(usd)

      await expect(service.convert(3500, 'USD')).resolves.toBe(98)
    })

    it('rounds half up to 2 decimal places', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...usd, rate_per_base: 0.125 })

      await expect(service.convert(1, 'USD')).resolves.toBe(0.13) // 0.125 -> 0.13
      await expect(service.convert(-1, 'USD')).resolves.toBe(-0.13)
      await expect(service.convert(0.1, 'USD')).resolves.toBe(0.01) // 0.0125 -> 0.01
    })

    it('accepts a Prisma Decimal-like amount and rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue({ ...usd, rate_per_base: { toFixed: () => '0.028000' } })

      await expect(service.convert({ toFixed: () => '1234.560000' }, 'USD')).resolves.toBe(34.57) // 34.56768
    })

    it('returns the amount unchanged for the base currency without a lookup', async () => {
      await expect(service.convert(3500, 'THB')).resolves.toBe(3500)
      expect(db.currency_rate.findUnique).not.toHaveBeenCalled()
    })

    it('throws not found for a currency with no rate', async () => {
      db.currency_rate.findUnique.mockResolvedValue(null)

      await expect(service.convert(100, 'EUR')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
