import { BadRequestException, NotFoundException } from '@nestjs/common'
import { SettingsService } from './settings.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('SettingsService', () => {
  const db = { $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)), flight_setting: { findMany: jest.fn(), upsert: jest.fn() } }
  const service = new SettingsService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops))
    db.flight_setting.findMany.mockResolvedValue([])
  })

  it('reads a missing setting as null and a saved one as typed', async () => {
    expect(await service.get()).toEqual({
      holding_limit_minutes: null,
      airline_code: null,
      approval_mode: 'auto',
      approval_response_delay_minutes: 0,
    })
    db.flight_setting.findMany.mockResolvedValue([
      { key: 'holding_limit_minutes', value: '30' },
      { key: 'airline_code', value: 'XX' },
      { key: 'approval_mode', value: 'manual' },
      { key: 'approval_response_delay_minutes', value: '15' },
    ])
    expect(await service.get()).toEqual({
      holding_limit_minutes: 30,
      airline_code: 'XX',
      approval_mode: 'manual',
      approval_response_delay_minutes: 15,
    })
  })

  it('validates the approval mode and the response delay', async () => {
    await expect(service.update({ approval_mode: 'sometimes' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.update({ approval_response_delay_minutes: -1 })).rejects.toBeInstanceOf(BadRequestException)
    await service.update({ approval_mode: 'manual', approval_response_delay_minutes: 0 })
    expect(db.flight_setting.upsert).toHaveBeenCalledTimes(2)
  })

  it('upserts only the keys sent and upper-cases the airline code', async () => {
    await service.update({ airline_code: 'xx' })
    expect(db.flight_setting.upsert).toHaveBeenCalledTimes(1)
    expect(db.flight_setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'airline_code' }, create: { key: 'airline_code', value: 'XX' } }),
    )
  })

  it('saves both keys in one transaction', async () => {
    await service.update({ holding_limit_minutes: 30, airline_code: 'xx' })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect((db.$transaction.mock.calls[0] as unknown[][])[0]).toHaveLength(2)
  })

  it.each([
    {},
    [],
    null,
    { holding_limit_minutes: 0 },
    { holding_limit_minutes: '30' },
    { holding_limit_minutes: 1.5 },
    { airline_code: 'XXX' },
  ])('rejects %j', async (body) => {
    await expect(service.update(body)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.flight_setting.upsert).not.toHaveBeenCalled()
  })

  it('saves one key from PUT flight-settings/:key, taking a number as text too', async () => {
    await service.updateOne('holding_limit_minutes', { value: '45' })
    expect(db.flight_setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'holding_limit_minutes' }, create: { key: 'holding_limit_minutes', value: '45' } }),
    )
  })

  it('refuses an unknown key with 404 and a missing or bad value with 400', async () => {
    await expect(Promise.resolve().then(() => service.updateOne('colour', { value: 'red' }))).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.updateOne('approval_mode', {})).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.updateOne('approval_mode', { value: 'sometimes' })).rejects.toBeInstanceOf(BadRequestException)
  })
})
