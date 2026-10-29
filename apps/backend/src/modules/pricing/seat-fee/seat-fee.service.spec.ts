import { ConflictException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { SeatFeeService } from './seat-fee.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const ID = '22222222-2222-2222-2222-222222222222'
const seatFee = { id: ID, cabin: 'economy', seat_type: 'exit_row', amount: 300, deleted_at: null }

describe('SeatFeeService', () => {
  let service: SeatFeeService
  const db = {
    seat_fee: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new SeatFeeService(db as unknown as DbService)
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
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'SEAT_FEE_NOT_FOUND' })
  })

  it('refuses a cabin + seat type that already has a live fee', async () => {
    db.seat_fee.findFirst.mockResolvedValue(seatFee)

    const error = await service.create({ cabin: 'economy', seat_type: 'exit_row', amount: 400 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'SEAT_FEE_EXISTS' })
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
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'SEAT_FEE_NOT_FOUND' })
  })
})
