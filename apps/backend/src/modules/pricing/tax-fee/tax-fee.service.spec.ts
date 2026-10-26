import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { TaxFeeService } from './tax-fee.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '33333333-3333-3333-3333-333333333333'
const vat = {
  id: ID,
  code: 'VAT',
  name: 'Value added tax',
  kind: 'tax',
  calc_type: 'pct',
  value: '7.00',
  is_active: true,
  deleted_at: null,
}
const airportFee = { ...vat, code: 'APT_FEE', name: 'Airport service fee', kind: 'fee', calc_type: 'flat', value: '700.00' }

describe('TaxFeeService', () => {
  let service: TaxFeeService
  const db = {
    tax_fee: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new TaxFeeService(db as unknown as DbService)
  })

  it('lists only live, active rows by default', async () => {
    db.tax_fee.findMany.mockResolvedValue([vat])

    await service.findAll()

    expect(db.tax_fee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, is_active: true } }))
  })

  it('includes inactive rows when asked', async () => {
    db.tax_fee.findMany.mockResolvedValue([vat])

    await service.findAll(true)

    expect(db.tax_fee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }))
  })

  it('throws TAX_FEE_NOT_FOUND for a missing or deleted row', async () => {
    db.tax_fee.findFirst.mockResolvedValue(null)

    const error = await service.findOne(ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'TAX_FEE_NOT_FOUND' })
  })

  it('refuses a code already used by a live row', async () => {
    db.tax_fee.findFirst.mockResolvedValue(vat)

    const error = await service.create({ code: 'VAT', name: 'VAT again', kind: 'tax', calc_type: 'pct', value: 7 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'TAX_FEE_CODE_TAKEN' })
    expect(db.tax_fee.create).not.toHaveBeenCalled()
  })

  it('maps a unique violation from the database to a conflict', async () => {
    db.tax_fee.findFirst.mockResolvedValue(null)
    db.tax_fee.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    await expect(service.create({ code: 'VAT', name: 'VAT', kind: 'tax', calc_type: 'pct', value: 7 })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('refuses a percentage over 100 on create', async () => {
    const error = await service.create({ code: 'BAD', name: 'Bad tax', kind: 'tax', calc_type: 'pct', value: 150 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'TAX_FEE_PCT_TOO_HIGH' })
    expect(db.tax_fee.create).not.toHaveBeenCalled()
  })

  it('allows a flat amount over 100', async () => {
    db.tax_fee.findFirst.mockResolvedValue(null)
    db.tax_fee.create.mockResolvedValue(airportFee)

    await service.create({ code: 'APT_FEE', name: 'Airport service fee', kind: 'fee', calc_type: 'flat', value: 700 })

    expect(db.tax_fee.create).toHaveBeenCalled()
  })

  it('refuses switching only calc_type to pct when the stored value is over 100', async () => {
    db.tax_fee.findFirst.mockResolvedValue(airportFee)

    await expect(service.update(ID, { calc_type: 'pct' })).rejects.toBeInstanceOf(BadRequestException)
    expect(db.tax_fee.update).not.toHaveBeenCalled()
  })

  it('refuses raising only the value over 100 on a pct row', async () => {
    db.tax_fee.findFirst.mockResolvedValue(vat)

    await expect(service.update(ID, { value: 101 })).rejects.toBeInstanceOf(BadRequestException)
    expect(db.tax_fee.update).not.toHaveBeenCalled()
  })

  it('turns a row off without deleting it', async () => {
    db.tax_fee.findFirst.mockResolvedValue(vat)

    await service.update(ID, { is_active: false })

    expect(db.tax_fee.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ is_active: false, updated_at: expect.any(Date) }),
    })
  })

  it('soft deletes and never hard deletes', async () => {
    db.tax_fee.findFirst.mockResolvedValue(vat)

    await service.remove(ID)

    expect(db.tax_fee.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
    expect(db.tax_fee.delete).not.toHaveBeenCalled()
  })
})
