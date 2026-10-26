import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { FareClassService } from './fare-class.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '11111111-1111-1111-1111-111111111111'
const fareClass = { id: ID, code: 'Y', cabin: 'economy', name: 'Economy', is_active: true, deleted_at: null }

describe('FareClassService', () => {
  let service: FareClassService
  const db = {
    fare_class: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    base_fare: { count: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new FareClassService(db as unknown as DbService)
  })

  it('lists only live, active classes by default', async () => {
    db.fare_class.findMany.mockResolvedValue([fareClass])

    await service.findAll()

    expect(db.fare_class.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, is_active: true } }))
  })

  it('throws FARE_CLASS_NOT_FOUND for a missing or deleted class', async () => {
    db.fare_class.findFirst.mockResolvedValue(null)

    const error = await service.findOne(ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FARE_CLASS_NOT_FOUND' })
  })

  it('refuses a code already used by a live class', async () => {
    db.fare_class.findFirst.mockResolvedValue(fareClass)

    await expect(service.create({ code: 'Y', cabin: 'economy', name: 'Economy 2' })).rejects.toBeInstanceOf(ConflictException)
    expect(db.fare_class.create).not.toHaveBeenCalled()
  })

  it('maps a unique violation from the database to a conflict', async () => {
    db.fare_class.findFirst.mockResolvedValue(null)
    db.fare_class.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    await expect(service.create({ code: 'Y', cabin: 'economy', name: 'Economy' })).rejects.toBeInstanceOf(ConflictException)
  })

  it('sets updated_at on update', async () => {
    db.fare_class.findFirst.mockResolvedValueOnce(fareClass)

    await service.update(ID, { name: 'Economy Saver' })

    expect(db.fare_class.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ name: 'Economy Saver', updated_at: expect.any(Date) }),
    })
  })

  it('returns only the rule columns for a live class', async () => {
    db.fare_class.findFirst.mockResolvedValue({ id: ID, refundable: false })

    await service.findRule(ID)

    expect(db.fare_class.findFirst).toHaveBeenCalledWith({
      where: { id: ID, deleted_at: null },
      select: expect.objectContaining({ id: true, refundable: true, change_fee_pct: true }),
    })
    expect(db.fare_class.findFirst.mock.calls[0][0].select).not.toHaveProperty('name')
  })

  it('throws FARE_CLASS_NOT_FOUND when reading the rule of a missing class', async () => {
    db.fare_class.findFirst.mockResolvedValue(null)

    await expect(service.findRule(ID)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('updates only rule columns and sets updated_at', async () => {
    db.fare_class.findFirst.mockResolvedValue({ ...fareClass, refundable: false })

    await service.updateRule(ID, { refundable: true, cancel_fee_flat: 200 })

    expect(db.fare_class.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { refundable: true, cancel_fee_flat: 200, updated_at: expect.any(Date) },
      select: expect.objectContaining({ refundable: true }),
    })
  })

  it('refuses a cancel fee on a class that stays non-refundable', async () => {
    db.fare_class.findFirst.mockResolvedValue({ ...fareClass, refundable: false, changeable: false })

    const error = await service.updateRule(ID, { cancel_fee_pct: 10 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'FARE_RULE_INVALID',
      details: { fields: ['cancel_fee_pct'] },
    })
    expect(db.fare_class.update).not.toHaveBeenCalled()
  })

  it('refuses turning changeable off while a change fee is still set', async () => {
    db.fare_class.findFirst.mockResolvedValue({ ...fareClass, changeable: true, change_fee_flat: '150.00' })

    await expect(service.update(ID, { changeable: false })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuses creating a non-refundable class with a cancel fee', async () => {
    await expect(service.create({ code: 'Y', cabin: 'economy', name: 'Economy', cancel_fee_flat: 100 })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(db.fare_class.create).not.toHaveBeenCalled()
  })

  it('refuses to delete a class that still has live base fares', async () => {
    db.fare_class.findFirst.mockResolvedValue(fareClass)
    db.base_fare.count.mockResolvedValue(2)

    const error = await service.remove(ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'FARE_CLASS_IN_USE', details: { base_fare_count: 2 } })
    expect(db.fare_class.update).not.toHaveBeenCalled()
  })

  it('soft deletes and never hard deletes', async () => {
    db.fare_class.findFirst.mockResolvedValue(fareClass)
    db.base_fare.count.mockResolvedValue(0)

    await service.remove(ID)

    expect(db.fare_class.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
    expect(db.fare_class.delete).not.toHaveBeenCalled()
  })
})
