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
    fare_quote: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  }
  const tx = {
    promo_redemption: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), createMany: jest.fn(), update: jest.fn() },
    $executeRaw: jest.fn(),
  }

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((work: (client: typeof tx) => Promise<unknown>) => work(tx))
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
    expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_CODE_NOT_FOUND' } })
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
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_CODE_INVALID' } })
      expect(db.promo_code.create).not.toHaveBeenCalled()
    })

    it('refuses a code already used by a live row', async () => {
      db.promo_code.findFirst.mockResolvedValue({ id: OTHER_ID })

      const error = await errorOf(service.create(save10))

      expect(error).toBeInstanceOf(ConflictException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_CODE_TAKEN', details: { promo_code_id: OTHER_ID } } })
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
      expect(error.getResponse()).toMatchObject({ error: { details: { fields: ['max_uses'] } } })
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

  describe('findQuotes', () => {
    const quote = {
      id: 'q1',
      seat_type: null,
      total_amount: '121.82',
      currency: 'USD',
      quoted_at: new Date('2026-10-30T00:00:00.000Z'),
      fare_class: { code: 'Y' },
      flight: { flight_number: 'TG999', dep_at: new Date('2026-11-06T00:00:00.000Z'), route: { origin: 'BKK', destination: 'CNX' } },
      promo_redemption: [] as { redeemed_at: Date }[],
    }

    it('finds the code whatever case staff typed, newest quotes first', async () => {
      db.promo_code.findFirst.mockResolvedValue({ id: PROMO_ID, code: 'SAVE10' })
      db.fare_quote.findMany.mockResolvedValue([])

      const result = await service.findQuotes(' save10 ')

      expect(db.promo_code.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'SAVE10', deleted_at: null } }))
      expect(db.fare_quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { promo_code_id: PROMO_ID }, orderBy: { quoted_at: 'desc' }, take: 50 }),
      )
      expect(result).toEqual({ promo_code_id: PROMO_ID, code: 'SAVE10', quotes: [] })
    })

    it('flattens each quote and shows when it was redeemed', async () => {
      const redeemedAt = new Date('2026-10-30T01:00:00.000Z')
      db.promo_code.findFirst.mockResolvedValue({ id: PROMO_ID, code: 'SAVE10' })
      db.fare_quote.findMany.mockResolvedValue([quote, { ...quote, id: 'q2', promo_redemption: [{ redeemed_at: redeemedAt }] }])

      const { quotes } = await service.findQuotes('SAVE10')

      expect(quotes[0]).toEqual({
        id: 'q1',
        seat_type: null,
        total_amount: '121.82',
        currency: 'USD',
        quoted_at: quote.quoted_at,
        fare_class_code: 'Y',
        flight_number: 'TG999',
        departs_at: quote.flight.dep_at,
        origin: 'BKK',
        destination: 'CNX',
        redeemed_at: null,
      })
      expect(quotes[1].redeemed_at).toBe(redeemedAt)
    })

    it('throws PROMO_CODE_NOT_FOUND for an unknown or deleted code', async () => {
      db.promo_code.findFirst.mockResolvedValue(null)

      const error = await errorOf(service.findQuotes('NOPE'))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_CODE_NOT_FOUND' } })
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
      ['not_found', null, during],
      ['inactive', { ...stored, is_active: false }, during],
      ['not_started', stored, new Date('2026-10-31T23:59:59.000Z')],
      ['expired', stored, stored.valid_to],
      ['exhausted', { ...stored, used_count: 500 }, during],
    ])('throws PROMO_INVALID with reason %s', async (reason, row, now) => {
      db.promo_code.findFirst.mockResolvedValue(row)

      const error = await errorOf(service.checkPromo('SAVE10', now))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_INVALID', details: { reason } } })
    })
  })

  describe('redeem (POST /promo-codes/:id/redemptions)', () => {
    const NOW = new Date('2026-11-10T05:00:00.000Z')
    const QUOTE_ID = '33333333-3333-3333-3333-333333333333'
    const dto = { booking_ref: 'BK-1', fare_quote_id: QUOTE_ID }
    const key = { promo_code_id_booking_ref: { promo_code_id: PROMO_ID, booking_ref: 'BK-1' } }
    const row = { id: 'r1', promo_code_id: PROMO_ID, booking_ref: 'BK-1', fare_quote_id: QUOTE_ID, status: 'redeemed', redeemed_at: NOW }

    beforeEach(() => {
      jest.useFakeTimers({ now: NOW })
      db.promo_code.findFirst.mockResolvedValue(stored)
      db.fare_quote.findUnique.mockResolvedValue({ id: QUOTE_ID, promo_code_id: PROMO_ID })
      tx.promo_redemption.findUnique.mockResolvedValue(null)
      tx.promo_redemption.createMany.mockResolvedValue({ count: 1 })
      tx.promo_redemption.findUniqueOrThrow.mockResolvedValue(row)
      tx.$executeRaw.mockResolvedValue(1)
    })

    afterEach(() => jest.useRealTimers())

    it('records the use against the booking at simulation time and counts one use, in one transaction', async () => {
      const result = await service.redeem(PROMO_ID, dto)

      expect(tx.promo_redemption.createMany).toHaveBeenCalledWith({
        data: [{ promo_code_id: PROMO_ID, booking_ref: 'BK-1', fare_quote_id: QUOTE_ID, redeemed_at: NOW }],
        skipDuplicates: true,
      })
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(db.$transaction).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ booking_ref: 'BK-1', status: 'redeemed', already_redeemed: false })
    })

    it('returns the first result and counts nothing for a repeat of the same booking_ref', async () => {
      tx.promo_redemption.findUnique.mockResolvedValue(row)

      const result = await service.redeem(PROMO_ID, dto)

      expect(tx.promo_redemption.findUnique).toHaveBeenCalledWith({ where: key })
      expect(tx.promo_redemption.createMany).not.toHaveBeenCalled()
      expect(tx.$executeRaw).not.toHaveBeenCalled()
      expect(result).toMatchObject({ already_redeemed: true })
    })

    it('does not count when a concurrent retry inserted the row first', async () => {
      tx.promo_redemption.createMany.mockResolvedValue({ count: 0 })

      const result = await service.redeem(PROMO_ID, dto)

      expect(tx.$executeRaw).not.toHaveBeenCalled()
      expect(result).toMatchObject({ already_redeemed: true })
    })

    it('lets two bookings redeem the same shared quote', async () => {
      await service.redeem(PROMO_ID, { ...dto, booking_ref: 'BK-2' })

      expect(tx.promo_redemption.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ booking_ref: 'BK-2', fare_quote_id: QUOTE_ID })] }),
      )
    })

    it('takes the use back for a booking whose use was released and is paid again', async () => {
      tx.promo_redemption.findUnique.mockResolvedValue({ ...row, status: 'released' })
      tx.promo_redemption.update.mockResolvedValue(row)

      const result = await service.redeem(PROMO_ID, dto)

      expect(tx.promo_redemption.createMany).not.toHaveBeenCalled()
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      expect(tx.promo_redemption.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'redeemed', released_at: null, redeemed_at: NOW, fare_quote_id: QUOTE_ID },
      })
      expect(result).toMatchObject({ already_redeemed: false })
    })

    it('throws PROMO_INVALID exhausted when no use is left, which rolls the redemption back', async () => {
      tx.$executeRaw.mockResolvedValue(0)

      const error = await errorOf(service.redeem(PROMO_ID, dto))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_INVALID', details: { reason: 'exhausted' } } })
    })

    it('throws QUOTE_NOT_FOUND for an unknown quote', async () => {
      db.fare_quote.findUnique.mockResolvedValue(null)

      const error = await errorOf(service.redeem(PROMO_ID, dto))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'QUOTE_NOT_FOUND' } })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('refuses a quote that was not priced with this promo code', async () => {
      db.fare_quote.findUnique.mockResolvedValue({ id: QUOTE_ID, promo_code_id: OTHER_ID })

      const error = await errorOf(service.redeem(PROMO_ID, dto))

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_INVALID' } })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('throws PROMO_CODE_NOT_FOUND for an unknown code', async () => {
      db.promo_code.findFirst.mockResolvedValue(null)

      await expect(service.redeem(PROMO_ID, dto)).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('release (DELETE /promo-codes/:id/redemptions/:booking_ref)', () => {
    const NOW = new Date('2026-11-10T05:00:00.000Z')
    const row = { id: 'r1', promo_code_id: PROMO_ID, booking_ref: 'BK-1', status: 'redeemed' }

    beforeEach(() => jest.useFakeTimers({ now: NOW }))
    afterEach(() => jest.useRealTimers())

    it('marks the use released at simulation time and gives it back', async () => {
      tx.promo_redemption.findUnique.mockResolvedValue(row)

      await service.release(PROMO_ID, 'BK-1')

      expect(tx.promo_redemption.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { status: 'released', released_at: NOW } })
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    })

    it('does nothing the second time', async () => {
      tx.promo_redemption.findUnique.mockResolvedValue({ ...row, status: 'released' })

      await service.release(PROMO_ID, 'BK-1')

      expect(tx.promo_redemption.update).not.toHaveBeenCalled()
      expect(tx.$executeRaw).not.toHaveBeenCalled()
    })

    it('throws PROMO_REDEMPTION_NOT_FOUND for a booking that never used the code', async () => {
      tx.promo_redemption.findUnique.mockResolvedValue(null)

      const error = await errorOf(service.release(PROMO_ID, 'BK-9'))

      expect(error).toBeInstanceOf(NotFoundException)
      expect(error.getResponse()).toMatchObject({ error: { code: 'PROMO_REDEMPTION_NOT_FOUND' } })
    })
  })
})
