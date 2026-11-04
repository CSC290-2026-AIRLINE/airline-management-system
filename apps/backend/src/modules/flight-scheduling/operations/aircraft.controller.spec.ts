import 'reflect-metadata'
import { IS_PUBLIC_KEY } from '@backend/auth/decorators/public.decorator'
import { AircraftController } from './aircraft.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('AircraftController', () => {
  const directory = { connected: true, availability: jest.fn(), typeFacts: jest.fn(), list: jest.fn() }
  const controller = new AircraftController(directory)

  it('lists the aircraft with snake_case fields', async () => {
    directory.list.mockResolvedValue([{ id: 'a1', tailNumber: 'ZZ-AAA', typeCode: 'Z320', model: 'Zed 320', maxRangeKm: 3000 }])
    await expect(controller.list()).resolves.toEqual({
      data: [{ id: 'a1', tail_number: 'ZZ-AAA', type_code: 'Z320', model: 'Zed 320', max_range_km: 3000 }],
    })
  })

  it('is not public: the global JWT guard applies', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AircraftController)).toBeUndefined()
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, (AircraftController.prototype as unknown as Record<string, object>).list)).toBeUndefined()
  })
})
