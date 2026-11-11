import { ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { SettingService } from '../setting/setting.service'
import type { TaxFeeService } from '../tax-fee/tax-fee.service'
import { SeatFeeService } from './seat-fee.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '22222222-2222-2222-2222-222222222222'
const seatFee = { id: ID, cabin: 'economy', seat_type: 'exit_row', amount: 300, deleted_at: null }

const VAT = { code: 'VAT', name: 'VAT', kind: 'tax', calc_type: 'pct', value: '7.00' }
const AIRPORT_FEE = { code: 'APT', name: 'Airport fee', kind: 'fee', calc_type: 'flat', value: '700.00' }
const taxFees = { findAll: jest.fn() }
const settings = { getBaseCurrency: jest.fn() }

describe('SeatFeeService', () => {
  let service: SeatFeeService
  const db = {
    seat_fee: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    taxFees.findAll.mockResolvedValue([VAT, AIRPORT_FEE])
    settings.getBaseCurrency.mockResolvedValue('USD')
    service = new SeatFeeService(db as unknown as DbService, taxFees as unknown as TaxFeeService, settings as unknown as SettingService)
  })

  it('lists only live seat fees', async () => {
    db.seat_fee.findMany.mockResolvedValue([seatFee])

    await service.findAll()

    expect(db.seat_fee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }))
  })

  it('throws SEAT_FEE_NOT_FOUND for a missing or deleted seat fee', async () => {
    db.seat_fee.findFirst.mockResolvedValue(null)

    const error = await service.findOne(ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ error: { code: 'SEAT_FEE_NOT_FOUND' } })
  })

  it('refuses a cabin + seat type that already has a live fee', async () => {
    db.seat_fee.findFirst.mockResolvedValue(seatFee)

    const error = await service.create({ cabin: 'economy', seat_type: 'exit_row', amount: 400 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ error: { code: 'SEAT_FEE_EXISTS' } })
    expect(db.seat_fee.create).not.toHaveBeenCalled()
  })

  it('maps a unique violation from the database to a conflict', async () => {
    db.seat_fee.findFirst.mockResolvedValue(null)
    db.seat_fee.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    await expect(service.create({ cabin: 'economy', seat_type: 'exit_row', amount: 300 })).rejects.toBeInstanceOf(ConflictException)
  })

  it('allows re-adding a pair after it was soft deleted', async () => {
    db.seat_fee.findFirst.mockResolvedValue(null)
    db.seat_fee.create.mockResolvedValue(seatFee)

    await service.create({ cabin: 'economy', seat_type: 'exit_row', amount: 300 })

    expect(db.seat_fee.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ deleted_at: null }) })
    expect(db.seat_fee.create).toHaveBeenCalled()
  })

  it('checks the final pair when only seat_type changes on update', async () => {
    db.seat_fee.findFirst.mockResolvedValueOnce(seatFee).mockResolvedValueOnce({ ...seatFee, id: 'other', seat_type: 'normal' })

    await expect(service.update(ID, { seat_type: 'normal' })).rejects.toBeInstanceOf(ConflictException)
    expect(db.seat_fee.findFirst).toHaveBeenLastCalledWith({
      where: { cabin: 'economy', seat_type: 'normal', deleted_at: null, id: { not: ID } },
    })
    expect(db.seat_fee.update).not.toHaveBeenCalled()
  })

  it('sets updated_at on update', async () => {
    db.seat_fee.findFirst.mockResolvedValueOnce(seatFee)

    await service.update(ID, { amount: 350 })

    expect(db.seat_fee.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ amount: 350, updated_at: expect.any(Date) }),
    })
  })

  it('soft deletes and never hard deletes', async () => {
    db.seat_fee.findFirst.mockResolvedValue(seatFee)

    await service.remove(ID)

    expect(db.seat_fee.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
    expect(db.seat_fee.delete).not.toHaveBeenCalled()
  })

  it('looks up a live fee by cabin + seat type', async () => {
    db.seat_fee.findFirst.mockResolvedValue(seatFee)

    await expect(service.lookup('economy', 'exit_row')).resolves.toEqual(seatFee)
    expect(db.seat_fee.findFirst).toHaveBeenCalledWith({ where: { cabin: 'economy', seat_type: 'exit_row', deleted_at: null } })
  })

  it('throws SEAT_FEE_NOT_FOUND when the lookup has no row', async () => {
    db.seat_fee.findFirst.mockResolvedValue(null)

    const error = await service.lookup('first', 'exit_row').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ error: { code: 'SEAT_FEE_NOT_FOUND' } })
  })

  describe('price (GET /seat-fees/price)', () => {
    const fees: Record<string, { amount: number }> = { normal: { amount: 0 }, exit_row: { amount: 300 }, extra_legroom: { amount: 400 } }

    beforeEach(() => {
      db.seat_fee.findFirst.mockImplementation(({ where }: { where: { seat_type: string } }) =>
        Promise.resolve({ ...seatFee, seat_type: where.seat_type, ...fees[where.seat_type] }),
      )
    })

    it('returns the amount, currency and percent taxes, and no flat tax', async () => {
      const price = await service.price('economy', 'exit_row')

      expect(price).toMatchObject({ amount: 300, currency: 'USD', total: 321, from_seat_type: null })
      expect(price.taxes).toEqual([{ code: 'VAT', name: 'VAT', kind: 'tax', rate_pct: 7, amount: 21 }])
    })

    it('charges only the difference on an upgrade', async () => {
      const price = await service.price('economy', 'extra_legroom', 'exit_row')

      expect(price).toMatchObject({ amount: 100, from_seat_type: 'exit_row', total: 107 })
    })

    it('never charges less than 0 on a downgrade', async () => {
      const price = await service.price('economy', 'normal', 'exit_row')

      expect(price).toMatchObject({ amount: 0, total: 0 })
    })

    it('throws SEAT_FEE_NOT_FOUND for a seat type with no fee', async () => {
      db.seat_fee.findFirst.mockResolvedValue(null)

      await expect(service.price('economy', 'exit_row')).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})
