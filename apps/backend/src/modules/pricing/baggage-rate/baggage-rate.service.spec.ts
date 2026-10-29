import { BadRequestException, ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { BaggageRateService, chargeableKgFor } from './baggage-rate.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '44444444-4444-4444-4444-444444444444'
const FARE_CLASS_ID = '55555555-5555-5555-5555-555555555555'
const ROUTE_ID = '66666666-6666-6666-6666-666666666666'
// Prisma returns Decimal objects; strings go through the same Number() conversions in the service.
const economyDefault = {
  id: ID,
  fare_class_id: FARE_CLASS_ID,
  route_id: null,
  free_allowance_kg: '20.0',
  rate_per_kg: '100.00',
  max_bag_kg: '32.0',
  is_active: true,
  deleted_at: null,
}
const bkkNrtOverride = { ...economyDefault, id: 'override', route_id: ROUTE_ID, free_allowance_kg: '23.0', rate_per_kg: '150.00' }

describe('BaggageRateService', () => {
  let service: BaggageRateService
  const db = {
    overweight_baggage_rate: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    fare_class: { findFirst: jest.fn() },
    route: { findUnique: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new BaggageRateService(db as unknown as DbService)
  })

  describe('charge for one bag (Economy default: 20 kg free, 100 THB/kg, max 32 kg)', () => {
    beforeEach(() => {
      db.overweight_baggage_rate.findFirst.mockResolvedValue(economyDefault)
    })

    it.each([
      [18, 0, 0],
      [20, 0, 0],
      [20.1, 1, 100],
      [25, 5, 500],
      [25.4, 6, 600],
    ])('%p kg → %p chargeable kg → %p THB', async (weightKg, chargeableKg, charge) => {
      const result = await service.calculateCharge(FARE_CLASS_ID, weightKg)

      expect(result).toMatchObject({ chargeable_kg: chargeableKg, charge })
    })

    it('refuses a 33 kg bag with BAGGAGE_TOO_HEAVY (422)', async () => {
      const error = await service.calculateCharge(FARE_CLASS_ID, 33).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(UnprocessableEntityException)
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'BAGGAGE_TOO_HEAVY' })
    })

    it('accepts a bag exactly at the max weight', async () => {
      await expect(service.calculateCharge(FARE_CLASS_ID, 32)).resolves.toMatchObject({ chargeable_kg: 12, charge: 1200 })
    })
  })

  it('has no weight limit when max_bag_kg is empty', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValue({ ...economyDefault, max_bag_kg: null })

    await expect(service.calculateCharge(FARE_CLASS_ID, 50)).resolves.toMatchObject({ chargeable_kg: 30, charge: 3000 })
  })

  it('uses the route override when one exists', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValueOnce(bkkNrtOverride)

    const result = await service.calculateCharge(FARE_CLASS_ID, 25, ROUTE_ID)

    expect(result).toMatchObject({ baggage_rate_id: 'override', chargeable_kg: 2, charge: 300 })
    expect(db.overweight_baggage_rate.findFirst).toHaveBeenCalledTimes(1)
  })

  it('falls back to the fare class default when the route has no override', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(economyDefault)

    const result = await service.calculateCharge(FARE_CLASS_ID, 25, ROUTE_ID)

    expect(result).toMatchObject({ baggage_rate_id: ID, charge: 500 })
    expect(db.overweight_baggage_rate.findFirst).toHaveBeenLastCalledWith({
      where: { fare_class_id: FARE_CLASS_ID, route_id: null, is_active: true, deleted_at: null },
    })
  })

  it('throws BAGGAGE_RATE_NOT_FOUND when there is no rate at all', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValue(null)

    const error = await service.calculateCharge(FARE_CLASS_ID, 25, ROUTE_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'BAGGAGE_RATE_NOT_FOUND' })
  })

  it('rounds float noise before rounding up', () => {
    expect(chargeableKgFor(25.4, 20)).toBe(6)
    expect(chargeableKgFor(20.3, 20.1)).toBe(1)
    expect(chargeableKgFor(23, 20)).toBe(3)
  })

  it('refuses a second default for the same fare class', async () => {
    db.fare_class.findFirst.mockResolvedValue({ id: FARE_CLASS_ID })
    db.overweight_baggage_rate.findFirst.mockResolvedValue({ id: ID })

    const error = await service
      .create({ fare_class_id: FARE_CLASS_ID, free_allowance_kg: 20, rate_per_kg: 100, max_bag_kg: 32 })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'BAGGAGE_RATE_EXISTS' })
    expect(db.overweight_baggage_rate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ route_id: null }) }),
    )
    expect(db.overweight_baggage_rate.create).not.toHaveBeenCalled()
  })

  it('refuses a second override for the same fare class + route', async () => {
    db.fare_class.findFirst.mockResolvedValue({ id: FARE_CLASS_ID })
    db.route.findUnique.mockResolvedValue({ id: ROUTE_ID })
    db.overweight_baggage_rate.findFirst.mockResolvedValue({ id: 'override' })

    await expect(
      service.create({ fare_class_id: FARE_CLASS_ID, route_id: ROUTE_ID, free_allowance_kg: 23, rate_per_kg: 150 }),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('maps a unique violation from the database to a conflict', async () => {
    db.fare_class.findFirst.mockResolvedValue({ id: FARE_CLASS_ID })
    db.overweight_baggage_rate.findFirst.mockResolvedValue(null)
    db.overweight_baggage_rate.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

    await expect(service.create({ fare_class_id: FARE_CLASS_ID, free_allowance_kg: 20, rate_per_kg: 100 })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('refuses a deleted or missing fare class', async () => {
    db.fare_class.findFirst.mockResolvedValue(null)

    const error = await service.create({ fare_class_id: FARE_CLASS_ID, free_allowance_kg: 20, rate_per_kg: 100 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'FARE_CLASS_NOT_FOUND' })
  })

  it('refuses an unknown route', async () => {
    db.fare_class.findFirst.mockResolvedValue({ id: FARE_CLASS_ID })
    db.route.findUnique.mockResolvedValue(null)

    const error = await service
      .create({ fare_class_id: FARE_CLASS_ID, route_id: ROUTE_ID, free_allowance_kg: 20, rate_per_kg: 100 })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'ROUTE_NOT_FOUND' })
  })

  it('refuses a free allowance not below the max bag weight', async () => {
    const error = await service
      .create({ fare_class_id: FARE_CLASS_ID, free_allowance_kg: 32, rate_per_kg: 100, max_bag_kg: 32 })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(BadRequestException)
    expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'BAGGAGE_RATE_INVALID' })
  })

  it('checks the final values on PATCH (lowering only max_bag_kg below the stored allowance)', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValue(economyDefault)

    await expect(service.update(ID, { max_bag_kg: 15 })).rejects.toBeInstanceOf(BadRequestException)
    expect(db.overweight_baggage_rate.update).not.toHaveBeenCalled()
  })

  it('soft deletes and never hard deletes', async () => {
    db.overweight_baggage_rate.findFirst.mockResolvedValue(economyDefault)

    await service.remove(ID)

    expect(db.overweight_baggage_rate.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ deleted_at: expect.any(Date) }),
    })
    expect(db.overweight_baggage_rate.delete).not.toHaveBeenCalled()
  })
})
