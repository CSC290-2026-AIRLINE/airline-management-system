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
