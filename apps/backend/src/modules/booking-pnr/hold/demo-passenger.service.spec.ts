jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }))

import type { DbService } from '@backend/db/db.service'
import type { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import { DemoPassengerService } from './demo-passenger.service'

function fixture(environment: string) {
  const findMany = jest.fn(() =>
    Promise.resolve([
      {
        id: 'seeded-id',
        first_name: 'Feature',
        last_name: 'Traveller',
        date_of_birth: new Date('1990-01-01'),
        passport_number: 'F03SEED001',
      },
    ]),
  )
  const service = new DemoPassengerService(
    { passenger: { findMany } } as unknown as DbService,
    { get: () => environment } as unknown as ConfigService<EnvConfig, true>,
  )
  return { service, findMany }
}

describe('DemoPassengerService', () => {
  it('returns real seeded IDs and requests only the two live synthetic profiles', async () => {
    const { service, findMany } = fixture('development')
    expect(await service.list()).toEqual([
      { id: 'seeded-id', givenName: 'Feature', familyName: 'Traveller', dateOfBirth: '1990-01-01', passportNumber: 'F03SEED001' },
    ])
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { passport_number: { in: ['F03SEED001', 'F03SEED002'] }, deleted_at: null } }),
    )
  })
  it.each(['production', 'test', '', 'staging'])('does not query passenger data in %s', async (environment) => {
    const { service, findMany } = fixture(environment)
    await expect(service.list()).rejects.toMatchObject({ status: 404 })
    expect(findMany).not.toHaveBeenCalled()
  })
  it('supports an unseeded database without inventing profiles', async () => {
    const { service, findMany } = fixture('development')
    findMany.mockResolvedValue([])
    expect(await service.list()).toEqual([])
  })
})
