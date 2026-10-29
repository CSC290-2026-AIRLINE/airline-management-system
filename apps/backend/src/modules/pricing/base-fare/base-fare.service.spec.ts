import { ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { BaseFareService } from './base-fare.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '11111111-1111-1111-1111-111111111111'
const ROUTE_ID = '22222222-2222-2222-2222-222222222222'
const FARE_CLASS_ID = '33333333-3333-3333-3333-333333333333'
const baseFare = { id: ID, route_id: ROUTE_ID, fare_class_id: FARE_CLASS_ID, amount: 1500, deleted_at: null }
const dto = { route_id: ROUTE_ID, fare_class_id: FARE_CLASS_ID, amount: 1500 }

function codeOf(error: unknown) {
  return ((error as NotFoundException | ConflictException).getResponse() as { code: string }).code
}

describe('BaseFareService', () => {
  let service: BaseFareService
  const db = {
    base_fare: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    route: { findUnique: jest.fn(), findMany: jest.fn() },
    fare_class: { findFirst: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new BaseFareService(db as unknown as DbService)
  })

  // Happy-path lookups for create: route exists, fare class is live, pair is free.
  function allowCreate() {
    db.route.findUnique.mockResolvedValue({ id: ROUTE_ID })
    db.fare_class.findFirst.mockResolvedValue({ id: FARE_CLASS_ID })
    db.base_fare.findFirst.mockResolvedValue(null)
  }

  it('lists active routes as picker options with only id, origin and destination', async () => {
    db.route.findMany.mockResolvedValue([])

    await service.findRouteOptions()

    expect(db.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_active: true }, select: { id: true, origin: true, destination: true } }),
    )
  })

  it('lists only live base fares and passes the filters through', async () => {
    db.base_fare.findMany.mockResolvedValue([baseFare])

    await service.findAll({ route_id: ROUTE_ID })

    expect(db.base_fare.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null, route_id: ROUTE_ID } }))
  })

  it('throws BASE_FARE_NOT_FOUND for a missing or deleted base fare', async () => {
    db.base_fare.findFirst.mockResolvedValue(null)

    const error = await service.findOne(ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect(codeOf(error)).toBe('BASE_FARE_NOT_FOUND')
  })

  it('creates a base fare when route, fare class and pair are all valid', async () => {
    allowCreate()
    db.base_fare.create.mockResolvedValue(baseFare)

    await expect(service.create(dto)).resolves.toEqual(baseFare)
    expect(db.base_fare.create).toHaveBeenCalledWith(expect.objectContaining({ data: dto }))
  })

  it('refuses an unknown route with ROUTE_NOT_FOUND', async () => {
    allowCreate()
    db.route.findUnique.mockResolvedValue(null)

    const error = await service.create(dto).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect(codeOf(error)).toBe('ROUTE_NOT_FOUND')
    expect(db.base_fare.create).not.toHaveBeenCalled()
  })

  it('refuses a missing or deleted fare class with FARE_CLASS_NOT_FOUND', async () => {
    allowCreate()
    db.fare_class.findFirst.mockResolvedValue(null)

    const error = await service.create(dto).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect(codeOf(error)).toBe('FARE_CLASS_NOT_FOUND')
    expect(db.base_fare.create).not.toHaveBeenCalled()
  })

  it('refuses a second live base fare for the same route and fare class', async () => {
    allowCreate()
    db.base_fare.findFirst.mockResolvedValue({ id: ID })

    const error = await service.create(dto).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect(codeOf(error)).toBe('BASE_FARE_EXISTS')
    expect(db.base_fare.create).not.toHaveBeenCalled()
  })

  it('maps a unique violation from the database to BASE_FARE_EXISTS', async () => {
    allowCreate()
    db.base_fare.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    const error = await service.create(dto).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect(codeOf(error)).toBe('BASE_FARE_EXISTS')
  })

  it('updates only the amount and sets updated_at', async () => {
    db.base_fare.findFirst.mockResolvedValueOnce(baseFare)

    await service.update(ID, { amount: 1800 })

    expect(db.base_fare.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID }, data: { amount: 1800, updated_at: expect.any(Date) } }),
    )
  })

  it('soft deletes and never hard deletes', async () => {
    db.base_fare.findFirst.mockResolvedValue(baseFare)

    await service.remove(ID)

    expect(db.base_fare.update).toHaveBeenCalledWith({ where: { id: ID }, data: expect.objectContaining({ deleted_at: expect.any(Date) }) })
    expect(db.base_fare.delete).not.toHaveBeenCalled()
  })
})
