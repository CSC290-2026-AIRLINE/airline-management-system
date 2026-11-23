import { BadRequestException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { SetupRuleService } from './setup-rule.service'
import type { AuditService } from '@backend/modules/admin-console/audit/audit.service'

// The service only needs `DbService` for its type; the real module is ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

/** Just enough of `DbService` for the language mapping writes, with every write recorded. */
/** The audit writer and the simulation clock, as the services only call them. */
const fakeAudit = () => ({
  resolveActor: jest.fn().mockResolvedValue({ type: 'staff', id: 'user-1', role: 'ops' }),
  write: jest.fn().mockResolvedValue({ id: 'a', seq: '1' }),
})

function setup() {
  const tx = { country_language: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() } }
  const db = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
    // The country checks: an airport is there, or the country already carries a rule or a mapping.
    airport: { findFirst: jest.fn().mockResolvedValue({ iata_code: 'BKK' }) },
    country_legality_rule: { findUnique: jest.fn().mockResolvedValue(null) },
    country_language: { findFirst: jest.fn().mockResolvedValue(null) },
  }
  const audit = fakeAudit()
  return { tx, db, audit, service: new SetupRuleService(db as unknown as DbService, audit as unknown as AuditService) }
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
    // The baseline read finds nothing and falls back to the defaults.
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
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
  return { db, service: new SetupRuleService(db as unknown as DbService, fakeAudit() as unknown as AuditService) }
}

describe('SetupRuleService lists', () => {
  it('lists the country rules with only what the table stores, the country shown as its upper-case code', async () => {
    const { service, db } = listSetup()

    const rows = await service.listCountryLimits()

    expect(db.crew_setting.findMany).toHaveBeenCalledTimes(1)
    expect(rows.map((row) => row.country)).toEqual(['JP', 'TH', 'SG'])
    expect(rows[0]).toEqual({ id: 'RL-jp', country: 'JP', countryCode: 'jp', minRestHours: 12, maxDutyHours: 11 })
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
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  const audit = fakeAudit()
  return { tx, db, audit, service: new SetupRuleService(db as unknown as DbService, audit as unknown as AuditService) }
}

describe('SetupRuleService country rule', () => {
  // `crew_setting.key` is a closed list, so a per-country key would fail the CHECK constraint. Every country uses `min_local_crew`.
  it('writes only the rule table, never a per-country crew_setting row', async () => {
    const { service, tx } = createSetup()

    await service.createCountryLimit({ country: 'SG', minRestHours: 11, maxDutyHours: 12 })

    expect(tx.country_legality_rule.create).toHaveBeenCalledWith({ data: { country_code: 'sg', min_rest_hours: 11, max_duty_hours: 12 } })
    expect(tx.crew_setting.upsert).not.toHaveBeenCalled()
    expect(tx.crew_setting.deleteMany).not.toHaveBeenCalled()
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
    // The limits as they stand, read before the write so the audit row can say what moved.
    crew_setting: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx)),
  }
  const audit = fakeAudit()
  return { tx, db, audit, service: new SetupRuleService(db as unknown as DbService, audit as unknown as AuditService) }
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

describe('SetupRuleService audit', () => {
  it('records a language change in the same transaction, saying what the list was and is', async () => {
    const { service, tx, audit } = setup()
    tx.country_language.findMany.mockResolvedValue([{ language_code: 'ja' }])

    await service.upsertCountryLanguages('th', { languages: ['th', 'en'] }, 'user-1')

    expect(audit.resolveActor).toHaveBeenCalledWith('user-1')
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFeature: '8',
        action: 'update',
        entityType: 'country_language',
        entityId: 'th',
        before: { languages: ['ja'] },
        after: { languages: ['en', 'th'] },
      }),
      tx,
    )
  })

  it('records only the limits that moved when the defaults are saved', async () => {
    const { service, tx, audit } = defaultsSetup()

    await service.updateDefaults({ ...baseline, minRestHours: 11 }, 'user-1')

    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'crew_setting',
        entityId: 'defaults',
        before: { minRestHours: 10 },
        after: { minRestHours: 11 },
      }),
      tx,
    )
  })

  it('writes no audit row for a baseline that is refused', async () => {
    const { service, audit } = defaultsSetup([{ country_code: 'jp', min_rest_hours: '11', max_duty_hours: '12' }])

    await expect(service.updateDefaults({ ...baseline, minRestHours: 12 }, 'user-1')).rejects.toThrow()

    expect(audit.write).not.toHaveBeenCalled()
  })
})
