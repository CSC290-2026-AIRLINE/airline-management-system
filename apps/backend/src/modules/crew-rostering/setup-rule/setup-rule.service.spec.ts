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
    // The country checks: an airport is there, or the country already carries a rule or a mapping.
    airport: { findFirst: jest.fn().mockResolvedValue({ iata_code: 'BKK' }) },
    country_legality_rule: { findUnique: jest.fn().mockResolvedValue(null) },
    country_language: { findFirst: jest.fn().mockResolvedValue(null) },
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
    expect(row).toMatchObject({ countryCode: 'th', country: 'TH', languages: ['th', 'en'] })
  })

  it('accepts a body that names the same country, in either case', async () => {
    const { service } = setup()

    await expect(service.upsertCountryLanguages('th', { country: 'th', languages: ['th'] })).resolves.toBeDefined()
    await expect(service.upsertCountryLanguages('th', { country: 'TH', languages: ['th'] })).resolves.toBeDefined()
  })

  it('refuses a country the database does not know, and writes nothing', async () => {
    const { service, db } = setup()
    db.airport.findFirst.mockResolvedValue(null)

    await expect(service.upsertCountryLanguages('zz', { languages: ['th'] })).rejects.toThrow('ZZ is not a supported destination')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a body that names another country, and writes nothing', async () => {
    const { service, db } = setup()

    await expect(service.upsertCountryLanguages('th', { country: 'JP', languages: ['ja'] })).rejects.toThrow(BadRequestException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

/** Just enough of `DbService` for the lists, with the number of reads recorded. */
function listSetup() {
  const db = {
    // Japan sets its own local-crew number (2); the baseline read finds nothing and falls back to 1.
    crew_setting: {
      findMany: jest.fn(({ where }: { where: { key: { in: string[] } } }) =>
        Promise.resolve(where.key.in.includes('min_local_crew.jp') ? [{ key: 'min_local_crew.jp', value: '2' }] : []),
      ),
    },
    country_legality_rule: {
      findMany: jest.fn().mockResolvedValue([
        { country_code: 'jp', min_rest_hours: '12', max_duty_hours: '11' },
        { country_code: 'th', min_rest_hours: '11', max_duty_hours: '12' },
        { country_code: 'sg', min_rest_hours: '12', max_duty_hours: '12' },
      ]),
    },
    country_language: {
      findMany: jest.fn().mockResolvedValue([
        { country_code: 'jp', language_code: 'ja' },
        { country_code: 'th', language_code: 'th' },
      ]),
    },
  }
  return { db, service: new SetupRuleService(db as unknown as DbService) }
}

describe('SetupRuleService lists', () => {
  it('lists the country rules with only what the table stores, the country shown as its upper-case code', async () => {
    const { service, db } = listSetup()

    const rows = await service.listCountryLimits()

    expect(db.crew_setting.findMany).toHaveBeenCalledTimes(2)
    expect(rows.map((row) => row.country)).toEqual(['JP', 'TH', 'SG'])
    expect(rows[0]).toEqual({ id: 'RL-jp', country: 'JP', countryCode: 'jp', minRestHours: 12, maxDutyHours: 11, minLocalCrew: 2 })
  })

  it("gives a country with no number of its own the default's", async () => {
    const { service } = listSetup()

    const rows = await service.listCountryLimits()

    expect(Object.fromEntries(rows.map((row) => [row.countryCode, row.minLocalCrew]))).toEqual({ jp: 2, th: 1, sg: 1 })
  })

  it('lists the language mappings with only what the table stores', async () => {
    const { service } = listSetup()

    const rows = await service.listCountryLanguages()

    expect(rows).toEqual([
      { id: 'CL-jp', country: 'JP', countryCode: 'jp', languages: ['ja'] },
      { id: 'CL-th', country: 'TH', countryCode: 'th', languages: ['th'] },
    ])
  })
})

/** Just enough of `DbService` to add a country rule, with every write recorded. */
function createSetup() {
  const tx = {
    country_legality_rule: { create: jest.fn() },
    crew_setting: { upsert: jest.fn(), deleteMany: jest.fn() },
  }
  const db = {
    airport: { findFirst: jest.fn().mockResolvedValue({ iata_code: 'SIN' }) },
    country_legality_rule: { findUnique: jest.fn().mockResolvedValue(null) },
    country_language: { findFirst: jest.fn().mockResolvedValue(null) },
    // The baseline is 1 local crew per leg when nothing is stored.
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  return { tx, db, service: new SetupRuleService(db as unknown as DbService) }
}

describe('SetupRuleService country local crew', () => {
  it("stores a number that differs from the default as the country's own crew_setting row", async () => {
    const { service, tx } = createSetup()

    await service.createCountryLimit({ country: 'SG', minRestHours: 11, maxDutyHours: 12, minLocalCrew: 2 })

    expect(tx.crew_setting.upsert).toHaveBeenCalledWith({
      where: { key: 'min_local_crew.sg' },
      update: expect.objectContaining({ value: '2' }),
      create: { key: 'min_local_crew.sg', value: '2' },
    })
  })

  it('stores nothing, and clears an old row, when the number equals the default', async () => {
    const { service, tx } = createSetup()

    await service.createCountryLimit({ country: 'SG', minRestHours: 11, maxDutyHours: 12, minLocalCrew: 1 })

    expect(tx.crew_setting.upsert).not.toHaveBeenCalled()
    expect(tx.crew_setting.deleteMany).toHaveBeenCalledWith({ where: { key: 'min_local_crew.sg' } })
  })

  it('leaves the stored number alone when the request does not carry one', async () => {
    const { service, tx } = createSetup()

    await service.createCountryLimit({ country: 'SG', minRestHours: 11, maxDutyHours: 12 })

    expect(tx.crew_setting.upsert).not.toHaveBeenCalled()
    expect(tx.crew_setting.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses a number that is not a whole number, and writes nothing', async () => {
    const { service, db } = createSetup()

    await expect(service.createCountryLimit({ country: 'SG', minRestHours: 11, maxDutyHours: 12, minLocalCrew: -1 })).rejects.toThrow(
      'minLocalCrew must be a whole number',
    )
    expect(db.$transaction).not.toHaveBeenCalled()
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

    await expect(service.updateDefaults({ ...baseline, minRestHours: 12 }, 'user-1')).rejects.toThrow('JP')
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
