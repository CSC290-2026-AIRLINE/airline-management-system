import { BadRequestException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { SetupRuleService } from './setup-rule.service'

// The service only needs `DbService` for its type; the real module is ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

/** Just enough of `DbService` for the language mapping writes, with every write recorded. */
function setup() {
  const tx = { country_language: { deleteMany: jest.fn(), createMany: jest.fn() } }
  const db = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
    crew: { count: jest.fn().mockResolvedValue(2) },
  }
  return { tx, db, service: new SetupRuleService(db as unknown as DbService) }
}

describe('SetupRuleService.upsertCountryLanguages', () => {
  it('writes the country in the URL when the body names none', async () => {
    const { service, tx } = setup()

    const row = await service.upsertCountryLanguages('th', { languages: ['TH', 'en'] })

    expect(tx.country_language.deleteMany).toHaveBeenCalledWith({ where: { country_code: 'th' } })
    expect(tx.country_language.createMany).toHaveBeenCalledWith({
      data: [
        { country_code: 'th', language_code: 'th' },
        { country_code: 'th', language_code: 'en' },
      ],
    })
    expect(row).toMatchObject({ countryCode: 'th', country: 'Thailand', languages: ['th', 'en'], speakingCrew: 2 })
  })

  it('accepts a body that names the same country, by name or by code', async () => {
    const { service } = setup()

    await expect(service.upsertCountryLanguages('th', { country: 'Thailand', languages: ['th'] })).resolves.toBeDefined()
    await expect(service.upsertCountryLanguages('th', { country: 'TH', languages: ['th'] })).resolves.toBeDefined()
  })

  it('refuses a body that names another country, and writes nothing', async () => {
    const { service, db } = setup()

    await expect(service.upsertCountryLanguages('th', { country: 'Japan', languages: ['ja'] })).rejects.toThrow(BadRequestException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

/** Just enough of `DbService` for the lists, with the number of reads recorded. */
function listSetup() {
  const db = {
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    country_legality_rule: {
      findMany: jest.fn().mockResolvedValue([
        { country_code: 'jp', min_rest_hours: '12', max_duty_hours: '11' },
        { country_code: 'th', min_rest_hours: '11', max_duty_hours: '12' },
        { country_code: 'sg', min_rest_hours: '12', max_duty_hours: '12' },
      ]),
    },
    pairing: {
      findMany: jest.fn().mockResolvedValue([
        {
          pairing_leg: [
            { flight: { route: { airport_route_destinationToairport: { country: 'jp' } } } },
            { flight: { route: { airport_route_destinationToairport: { country: 'th' } } } },
          ],
        },
        { pairing_leg: [{ flight: { route: { airport_route_destinationToairport: { country: 'jp' } } } }] },
      ]),
      count: jest.fn(),
    },
    country_language: {
      findMany: jest.fn().mockResolvedValue([
        { country_code: 'jp', language_code: 'ja' },
        { country_code: 'th', language_code: 'th' },
      ]),
    },
    crew: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ languages: ['th', 'en'] }, { languages: ['ja'] }, { languages: ['en'] }, { languages: ['th', 'ja'] }]),
      count: jest.fn(),
    },
  }
  return { db, service: new SetupRuleService(db as unknown as DbService) }
}

describe('SetupRuleService lists', () => {
  it('counts the pairings each country affects from one read, and a pairing once per country', async () => {
    const { service, db } = listSetup()

    const rows = await service.listCountryLimits()

    expect(db.pairing.findMany).toHaveBeenCalledTimes(1)
    expect(db.pairing.count).not.toHaveBeenCalled()
    expect(db.crew_setting.findMany).toHaveBeenCalledTimes(1)
    expect(Object.fromEntries(rows.map((row) => [row.countryCode, row.affectedPairings]))).toEqual({ jp: 2, th: 1, sg: 0 })
  })

  it('counts the crew who speak each mapping from one read', async () => {
    const { service, db } = listSetup()

    const rows = await service.listCountryLanguages()

    expect(db.crew.findMany).toHaveBeenCalledTimes(1)
    expect(db.crew.count).not.toHaveBeenCalled()
    expect(Object.fromEntries(rows.map((row) => [row.countryCode, row.speakingCrew]))).toEqual({ jp: 2, th: 2 })
  })
})

const baseline = {
  minRestHours: 10,
  maxDutyHours: 13,
  maxFlightsPerDuty: 4,
  maxPairingDays: 3,
  hoursCap28d: 100,
  minLocalCrew: 1,
  minPolice: 2,
}

/** Just enough of `DbService` for `updateDefaults`, with the writes recorded. */
function defaultsSetup(rules: { country_code: string; min_rest_hours: string; max_duty_hours: string }[] = []) {
  const tx = { country_legality_rule: { findMany: jest.fn().mockResolvedValue(rules) }, crew_setting: { upsert: jest.fn() } }
  const db = {
    staff: { findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  return { tx, db, service: new SetupRuleService(db as unknown as DbService) }
}

describe('SetupRuleService.updateDefaults', () => {
  it('writes all seven settings in one transaction, attributed to the staff row', async () => {
    const { service, tx, db } = defaultsSetup()

    await service.updateDefaults({ ...baseline, minRestHours: 11 }, 'user-1')

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.crew_setting.upsert).toHaveBeenCalledTimes(7)
    expect(tx.crew_setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'min_rest_hours' },
        create: expect.objectContaining({ value: '11', updated_by: 'staff-1' }),
      }),
    )
  })

  it('refuses a baseline that would leave a country rule looser, and writes nothing', async () => {
    const { service, tx } = defaultsSetup([{ country_code: 'jp', min_rest_hours: '10', max_duty_hours: '12' }])

    await expect(service.updateDefaults({ ...baseline, minRestHours: 12 }, 'user-1')).rejects.toThrow('Japan')
    await expect(service.updateDefaults({ ...baseline, maxDutyHours: 11 }, 'user-1')).rejects.toThrow(BadRequestException)
    expect(tx.crew_setting.upsert).not.toHaveBeenCalled()
  })

  it('accepts a baseline every country rule is still at least as strict as', async () => {
    const { service } = defaultsSetup([{ country_code: 'jp', min_rest_hours: '12', max_duty_hours: '11' }])

    await expect(service.updateDefaults({ ...baseline, minRestHours: 12, maxDutyHours: 12 }, 'user-1')).resolves.toBeDefined()
  })

  it.each([
    ['minRestHours', { minRestHours: 0 }],
    ['maxDutyHours', { maxDutyHours: 25 }],
    ['maxFlightsPerDuty', { maxFlightsPerDuty: 2.5 }],
    ['maxPairingDays', { maxPairingDays: 0 }],
    ['hoursCap28d', { hoursCap28d: 0 }],
    ['minLocalCrew', { minLocalCrew: -1 }],
    ['minPolice', { minPolice: 1.5 }],
  ])('refuses a bad %s before touching the database', async (field, change) => {
    const { service, db } = defaultsSetup()

    await expect(service.updateDefaults({ ...baseline, ...change }, 'user-1')).rejects.toThrow(field)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
