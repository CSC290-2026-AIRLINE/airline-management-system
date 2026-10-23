import { BadRequestException } from '@nestjs/common'
import { SettingsService } from './settings.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('SettingsService', () => {
  const db = { flight_setting: { findMany: jest.fn(), upsert: jest.fn() } }
  const service = new SettingsService(db as never)

  beforeEach(() => {
    jest.resetAllMocks()
    db.flight_setting.findMany.mockResolvedValue([])
  })

  it('reads a missing setting as null and a saved one as typed', async () => {
    expect(await service.get()).toEqual({ holding_limit_minutes: null, airline_code: null })
    db.flight_setting.findMany.mockResolvedValue([
      { key: 'holding_limit_minutes', value: '30' },
      { key: 'airline_code', value: 'XX' },
    ])
    expect(await service.get()).toEqual({ holding_limit_minutes: 30, airline_code: 'XX' })
  })

  it('upserts only the keys sent and upper-cases the airline code', async () => {
    await service.update({ airline_code: 'xx' })
    expect(db.flight_setting.upsert).toHaveBeenCalledTimes(1)
    expect(db.flight_setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'airline_code' }, create: { key: 'airline_code', value: 'XX' } }),
    )
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
})
