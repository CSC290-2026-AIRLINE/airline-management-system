import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AirportFeeService } from './airport-fee.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = '00000000-0000-0000-0000-000000000001'
const valid = {
  airport: 'bkk',
  fee_type: 'landing',
  applies_on: 'arrival',
  amount: 12000,
  unit: 'per_flight',
  currency: 'thb',
  effective_from: '2026-01-01',
}
const row = { id: ID, airport: 'BKK', amount: '12000', effective_from: new Date('2026-01-01T00:00:00Z'), effective_to: null }
const prismaError = (code: string) => Object.assign(new Error(code), { code })

describe('AirportFeeService', () => {
  const db = {
    airport_fee: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    airport: { findUnique: jest.fn() },
  }
  const service = new AirportFeeService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.airport.findUnique.mockResolvedValue({ iata_code: 'BKK' })
    db.airport_fee.findFirst.mockResolvedValue(null)
  })

  it('creates with normalised codes and returns a plain number and plain dates', async () => {
    db.airport_fee.create.mockResolvedValue(row)
    const result = await service.create(valid)
    expect(db.airport_fee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        airport: 'BKK',
        currency: 'THB',
        effective_from: new Date('2026-01-01T00:00:00Z'),
        effective_to: null,
      }),
    })
    expect(result).toMatchObject({ amount: 12000, effective_from: '2026-01-01', effective_to: null })
  })

  it.each([
    { amount: -1 },
    { fee_type: 'tax' },
    { applies_on: 'ground' },
    { unit: 'per_day' },
    { currency: 'baht' },
    { effective_from: '2026-02-30' },
    { effective_from: '2026-05-01', effective_to: '2026-04-01' },
  ])('rejects %j', async (patch) => {
    await expect(service.create({ ...valid, ...patch })).rejects.toBeInstanceOf(BadRequestException)
    expect(db.airport_fee.create).not.toHaveBeenCalled()
  })

  it('rejects a missing airport and an overlapping fee', async () => {
    db.airport.findUnique.mockResolvedValue(null)
    await expect(service.create(valid)).rejects.toBeInstanceOf(BadRequestException)
    db.airport.findUnique.mockResolvedValue({ iata_code: 'BKK' })
    db.airport_fee.findFirst.mockResolvedValue(row)
    await expect(service.create(valid)).rejects.toBeInstanceOf(ConflictException)
  })

  it('ignores the fee being edited when it checks for an overlap, and 404s a missing one', async () => {
    db.airport_fee.update.mockRejectedValue(prismaError('P2025'))
    await expect(service.update(ID, valid)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.airport_fee.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: { not: ID } }) })
    await expect(service.update('nope', valid)).rejects.toBeInstanceOf(BadRequestException)
  })
})
