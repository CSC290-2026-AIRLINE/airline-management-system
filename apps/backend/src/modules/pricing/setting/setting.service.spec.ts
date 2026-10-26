import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { SettingService } from './setting.service'

// The real DbService loads @nestjs/config (ESM only), which Jest cannot load. The tests never use it: they pass `db` below.
jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))

const USER_ID = '11111111-1111-1111-1111-111111111111'
const STAFF_ID = '22222222-2222-2222-2222-222222222222'

describe('SettingService', () => {
  let service: SettingService
  const db = {
    pricing_setting: { findMany: jest.fn(), findUnique: jest.fn(), upsert: jest.fn() },
    staff: { findFirst: jest.fn() },
  }

  beforeEach(() => {
    jest.resetAllMocks()
    service = new SettingService(db as unknown as DbService)
  })

  it('lists every key, filling in defaults for rows the seed has not inserted', async () => {
    db.pricing_setting.findMany.mockResolvedValue([
      { key: 'quote_hold_minutes', value: '20', updated_at: new Date(), updated_by: STAFF_ID },
    ])

    const settings = await service.findAll()

    expect(settings).toEqual([
      expect.objectContaining({ key: 'quote_hold_minutes', value: '20' }),
      { key: 'base_currency', value: 'THB', updated_at: null, updated_by: null },
    ])
  })

  it('throws SETTING_NOT_FOUND for an unknown key', async () => {
    const error = await service.update('tax_rate', '7', USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(NotFoundException)
    expect((error as NotFoundException).getResponse()).toMatchObject({ code: 'SETTING_NOT_FOUND' })
  })

  it('refuses to change base_currency', async () => {
    const error = await service.update('base_currency', 'USD', USER_ID).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ConflictException)
    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'SETTING_READ_ONLY' })
    expect(db.pricing_setting.upsert).not.toHaveBeenCalled()
  })

  it.each(['0', '-5', '1.5', 'abc', '015', '1441'])('refuses quote_hold_minutes = %s', async (value) => {
    await expect(service.update('quote_hold_minutes', value, USER_ID)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.pricing_setting.upsert).not.toHaveBeenCalled()
  })

  it('saves quote_hold_minutes with the caller staff id', async () => {
    db.staff.findFirst.mockResolvedValue({ id: STAFF_ID })

    await service.update('quote_hold_minutes', '30', USER_ID)

    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: USER_ID, deleted_at: null } }))
    expect(db.pricing_setting.upsert).toHaveBeenCalledWith({
      where: { key: 'quote_hold_minutes' },
      create: { key: 'quote_hold_minutes', value: '30', updated_by: STAFF_ID, updated_at: expect.any(Date) },
      update: { value: '30', updated_by: STAFF_ID, updated_at: expect.any(Date) },
    })
  })

  it('refuses a caller with no staff record', async () => {
    db.staff.findFirst.mockResolvedValue(null)

    await expect(service.update('quote_hold_minutes', '30', USER_ID)).rejects.toBeInstanceOf(ForbiddenException)
    expect(db.pricing_setting.upsert).not.toHaveBeenCalled()
  })

  it('reads stored values for other modules', async () => {
    db.pricing_setting.findUnique.mockResolvedValueOnce({ key: 'base_currency', value: 'USD' })
    db.pricing_setting.findUnique.mockResolvedValueOnce({ key: 'quote_hold_minutes', value: '25' })

    expect(await service.getBaseCurrency()).toBe('USD')
    expect(await service.getQuoteHoldMinutes()).toBe(25)
  })

  it('falls back to defaults when the rows are missing', async () => {
    db.pricing_setting.findUnique.mockResolvedValue(null)

    expect(await service.getBaseCurrency()).toBe('THB')
    expect(await service.getQuoteHoldMinutes()).toBe(15)
  })
})
