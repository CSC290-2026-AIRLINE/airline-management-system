import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { CreatePromoCodeDto } from './dto/create-promo-code.dto'
import { PromoCodeService } from './promo-code.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const PROMO_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ID = '22222222-2222-2222-2222-222222222222'

const stored = {
  id: PROMO_ID,
  code: 'SAVE10',
  kind: 'promo',
  discount_pct: '10.00',
  discount_amount: null,
  valid_from: new Date('2026-11-01T00:00:00.000Z'),
  valid_to: new Date('2026-12-01T00:00:00.000Z'),
  max_uses: 500,
  used_count: 3,
  is_active: true,
  deleted_at: null,
}

const save10: CreatePromoCodeDto = {
  code: 'SAVE10',
  kind: 'promo',
  discount_pct: 10,
  valid_from: '2026-11-01T00:00:00Z',
  valid_to: '2026-12-01T00:00:00Z',
  max_uses: 500,
}

// Every Nest HTTP exception has getResponse(); the tests check its type separately with toBeInstanceOf.
async function errorOf(promise: Promise<unknown>): Promise<BadRequestException> {
  try {
    await promise
  } catch (error) {
    return error as BadRequestException
  }
  throw new Error('Expected the call to be rejected')
}

describe('PromoCodeService', () => {
  let service: PromoCodeService
  const db = {
    promo_code: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new PromoCodeService(db as unknown as DbService)
  })

  describe('findAll', () => {
    it('hides inactive and deleted codes by default', async () => {
      db.promo_code.findMany.mockResolvedValue([])

      await service.findAll()

      expect(db.promo_code.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, is_active: true } }))
    })

    it('includes inactive codes when asked', async () => {
      db.promo_code.findMany.mockResolvedValue([])

      await service.findAll(true)

      expect(db.promo_code.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }))
    })
  })

  it('throws PROMO_CODE_NOT_FOUND for a missing or deleted code', async () => {
    db.promo_code.findFirst.mockResolvedValue(null)

    const error = await errorOf(service.findOne(PROMO_ID))

    expect(error).toBeInstanceOf(NotFoundException)
    expect(error.getResponse()).toMatchObject({ code: 'PROMO_CODE_NOT_FOUND' })
  })

  describe('create', () => {
    it('stores a percentage code with real dates', async () => {
      db.promo_code.findFirst.mockResolvedValue(null)

      await service.create(save10)

      expect(db.promo_code.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'SAVE10',
          discount_pct: 10,
          valid_from: new Date('2026-11-01T00:00:00Z'),
          valid_to: new Date('2026-12-01T00:00:00Z'),
        }),
      })
    })

    it('accepts a fixed amount with unlimited uses', async () => {
      db.promo_code.findFirst.mockResolvedValue(null)

      await service.create({
        code: 'KMUTT500',
        kind: 'corporate',
        discount_amount: 500,
        valid_from: '2026-01-01T00:00:00Z',
        valid_to: '2027-01-01T00:00:00Z',
      })

      expect(db.promo_code.create).toHaveBeenCalledTimes(1)
    })

    it.each<[string, Partial<CreatePromoCodeDto>]>([
      ['both discounts', { discount_amount: 50 }],
      ['no discount', { discount_pct: null }],
      ['valid_from after valid_to', { valid_from: '2026-12-02T00:00:00Z' }],
      ['valid_from equal to valid_to', { valid_from: '2026-12-01T00:00:00Z' }],
    ])('refuses %s', async (_label, change) => {
      const error = await errorOf(service.create({ ...save10, ...change }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.getResponse()).toMatchObject({ code: 'PROMO_CODE_INVALID' })
      expect(db.promo_code.create).not.toHaveBeenCalled()
    })

    it('refuses a code already used by a live row', async () => {
      db.promo_code.findFirst.mockResolvedValue({ id: OTHER_ID })

      const error = await errorOf(service.create(save10))

      expect(error).toBeInstanceOf(ConflictException)
      expect(error.getResponse()).toMatchObject({ code: 'PROMO_CODE_TAKEN', details: { promo_code_id: OTHER_ID } })
    })

    it('maps a unique violation from the database to PROMO_CODE_TAKEN', async () => {
      db.promo_code.findFirst.mockResolvedValue(null)
      db.promo_code.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

      await expect(service.create(save10)).rejects.toBeInstanceOf(ConflictException)
    })
  })

  describe('update', () => {
    it('switches a percentage code to a fixed amount when the old value is cleared', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await service.update(PROMO_ID, { discount_pct: null, discount_amount: 50 })

      expect(db.promo_code.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PROMO_ID },
          data: expect.objectContaining({ discount_pct: null, discount_amount: 50, updated_at: expect.any(Date) }),
        }),
      )
    })

    it('checks the merged row, so adding a second discount is refused', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await expect(service.update(PROMO_ID, { discount_amount: 50 })).rejects.toBeInstanceOf(BadRequestException)
      expect(db.promo_code.update).not.toHaveBeenCalled()
    })

    it('checks a new valid_to against the stored valid_from', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await expect(service.update(PROMO_ID, { valid_to: '2026-10-01T00:00:00Z' })).rejects.toBeInstanceOf(BadRequestException)
    })

    it('refuses max_uses below the uses already counted', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored) // used_count 3

      const error = await errorOf(service.update(PROMO_ID, { max_uses: 2 }))

      expect(error).toBeInstanceOf(BadRequestException)
      expect(error.getResponse()).toMatchObject({ details: { fields: ['max_uses'] } })
    })

    it('allows clearing max_uses to make a code unlimited', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await service.update(PROMO_ID, { max_uses: null })

      expect(db.promo_code.update).toHaveBeenCalledTimes(1)
    })

    it('leaves the dates alone when they are not sent', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await service.update(PROMO_ID, { is_active: false })

      const { data } = db.promo_code.update.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(data.valid_from).toBeUndefined()
      expect(data.valid_to).toBeUndefined()
    })

    it('refuses a code taken by another row', async () => {
      db.promo_code.findFirst.mockResolvedValueOnce(stored).mockResolvedValueOnce({ id: OTHER_ID })

      await expect(service.update(PROMO_ID, { code: 'OTHER' })).rejects.toBeInstanceOf(ConflictException)
      expect(db.promo_code.update).not.toHaveBeenCalled()
    })
  })

  it('soft deletes', async () => {
    db.promo_code.findFirst.mockResolvedValue(stored)

    await service.remove(PROMO_ID)

    expect(db.promo_code.update).toHaveBeenCalledWith({
      where: { id: PROMO_ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
  })

  describe('checkPromo', () => {
    const during = new Date('2026-11-15T00:00:00.000Z')

    it('returns a valid promo, whatever case the customer typed', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await expect(service.checkPromo(' save10 ', during)).resolves.toBe(stored)
      expect(db.promo_code.findFirst).toHaveBeenCalledWith({ where: { code: 'SAVE10', deleted_at: null } })
    })

    it('is valid exactly at valid_from', async () => {
      db.promo_code.findFirst.mockResolvedValue(stored)

      await expect(service.checkPromo('SAVE10', stored.valid_from)).resolves.toBe(stored)
    })

    it('treats an unlimited code as never exhausted', async () => {
      const unlimited = { ...stored, max_uses: null, used_count: 9999 }
      db.promo_code.findFirst.mockResolvedValue(unlimited)

      await expect(service.checkPromo('SAVE10', during)).resolves.toBe(unlimited)
    })

    it.each<[string, object | null, Date]>([
      ['unknown', null, during],
      ['inactive', { ...stored, is_active: false }, during],
      ['not_yet_valid', stored, new Date('2026-10-31T23:59:59.000Z')],
      ['expired', stored, stored.valid_to],
      ['exhausted', { ...stored, used_count: 500 }, during],
    ])('throws PROMO_INVALID with reason %s', async (reason, row, now) => {
      db.promo_code.findFirst.mockResolvedValue(row)

      const error = await errorOf(service.checkPromo('SAVE10', now))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({ code: 'PROMO_INVALID', details: { reason } })
    })
  })
})
