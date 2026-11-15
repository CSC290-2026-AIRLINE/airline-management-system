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
  let created = 0
  const create = jest.fn((args: { data: Record<string, unknown> }) => {
    created += 1
    return Promise.resolve({ id: `created-${created}`, ...args.data })
  })
  const $transaction = jest.fn((rows: Array<Promise<unknown>>) => Promise.all(rows))
  const service = new DemoPassengerService(
    { passenger: { findMany, create }, $transaction } as unknown as DbService,
    { get: () => environment } as unknown as ConfigService<EnvConfig, true>,
  )
  return { service, findMany, create, $transaction }
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

  it('turns typed passenger details into passenger records', async () => {
    const { service, create } = fixture('development')
    const created = await service.create([
      { givenName: 'Manual', familyName: 'Traveller', dateOfBirth: '1988-04-05', passportNumber: 'X1234567' },
      { givenName: 'Second', familyName: 'Traveller', dateOfBirth: '2016-07-08', passportNumber: 'X7654321' },
    ])
    expect(created).toEqual([{ id: 'created-1' }, { id: 'created-2' }])
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0][0].data).toEqual({
      first_name: 'Manual',
      last_name: 'Traveller',
      date_of_birth: new Date('1988-04-05T00:00:00Z'),
      passport_number: 'X1234567',
    })
  })
  it.each(['production', 'test', '', 'staging'])('does not create passenger records in %s', async (environment) => {
    const { service, create } = fixture(environment)
    await expect(
      service.create([{ givenName: 'Manual', familyName: 'Traveller', dateOfBirth: '1988-04-05', passportNumber: 'X1234567' }]),
    ).rejects.toMatchObject({ status: 404 })
    expect(create).not.toHaveBeenCalled()
  })
  it('rejects a date of birth that is not a real date', async () => {
    const { service, create } = fixture('development')
    await expect(
      service.create([{ givenName: 'Manual', familyName: 'Traveller', dateOfBirth: '2024-02-31', passportNumber: 'X1234567' }]),
    ).rejects.toMatchObject({ status: 422 })
    expect(create).not.toHaveBeenCalled()
  })
})
