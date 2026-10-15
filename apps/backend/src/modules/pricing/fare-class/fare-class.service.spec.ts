import { ConflictException, NotFoundException } from '@nestjs/common'
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

  it('soft deletes and never hard deletes', async () => {
    db.fare_class.findFirst.mockResolvedValue(fareClass)

    await service.remove(ID)

    expect(db.fare_class.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
    expect(db.fare_class.delete).not.toHaveBeenCalled()
  })
})
