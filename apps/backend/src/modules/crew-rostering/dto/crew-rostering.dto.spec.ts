import { BadRequestException, type ArgumentMetadata } from '@nestjs/common'
import { AutoAssignDto, AutoAssignQueryDto } from '@backend/modules/crew-rostering/assign-crew/dto/assign-crew.dto'
import { CommitPairingsDto, SaveLegsDto } from '@backend/modules/crew-rostering/build-pairing/dto/build-pairing.dto'
import { OverrideDto, SickCallDto } from '@backend/modules/crew-rostering/fix-publish/dto/fix-publish.dto'
import { CertificationDto, CrewProfileDto, ListCrewQueryDto } from '@backend/modules/crew-rostering/setup-crew/dto/setup-crew.dto'
import { CountryLanguageDto, DefaultLimitsDto } from '@backend/modules/crew-rostering/setup-rule/dto/setup-rule.dto'
import { rosteringValidationPipe, uuidParam } from './validation'
import { WindowQueryDto } from './window-query.dto'

// The DTOs import their services' types; the real modules behind those are ESM.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/db/generated/prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error {} } }))

const ID = '0f4b6a52-6d1c-4f0e-9a52-0d3d6a9b7c11'

/** Runs the controllers' pipe on a value, as Nest does for `@Body()` or `@Query()`. */
function validate<T>(metatype: new () => T, value: unknown, type: ArgumentMetadata['type'] = 'body'): Promise<T> {
  return rosteringValidationPipe.transform(value, { type, metatype }) as Promise<T>
}

/** The messages a refusal carries, which `RosteringExceptionFilter` joins into one. */
async function messages(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error
    const body = error.getResponse() as { message: string | string[] }
    return Array.isArray(body.message) ? body.message : [body.message]
  }
  throw new Error('expected a 400')
}

describe('path ids', () => {
  it('answers 400 naming the parameter, not a database error, when an id is not a UUID', async () => {
    await expect(uuidParam('crewId').transform('abc', { type: 'param' })).rejects.toThrow('crewId must be a UUID')
    await expect(uuidParam('crewId').transform(ID, { type: 'param' })).resolves.toBe(ID)
  })
})

describe('WindowQueryDto', () => {
  it('accepts a window and upper-cases the base', async () => {
    const window = await validate(WindowQueryDto, { dateFrom: '2026-09-15', dateTo: '2026-09-19', base: ' bkk ' }, 'query')
    expect(window).toMatchObject({ dateFrom: '2026-09-15', dateTo: '2026-09-19', base: 'BKK' })
  })

  it('accepts only real YYYY-MM-DD dates, not instants', async () => {
    expect(await messages(validate(WindowQueryDto, { dateFrom: '2026-09-15T00:00:00Z', dateTo: '2026-09-19', base: 'BKK' }))).toEqual([
      'dateFrom must be a YYYY-MM-DD date',
    ])
  })

  it('refuses a window that ends before it starts, and a base that is not an IATA code', async () => {
    const found = await messages(validate(WindowQueryDto, { dateFrom: '2026-09-19', dateTo: '2026-09-15', base: 'BANGKOK' }))
    expect(found).toEqual(expect.arrayContaining(['dateTo must be on or after dateFrom', 'base must be a 3-letter IATA code']))
  })
})

describe('CrewProfileDto', () => {
  const profile = {
    firstName: ' Chai ',
    lastName: 'Boonma',
    employeeNo: 'DEMO019',
    role: 'police',
    base: 'bkk',
    fleet: 'A320',
    languages: ['TH', 'en'],
    licenceNumber: 'LIC-D0019',
    licenceExpiresOn: '2028-12-31',
  }

  it('trims and normalises, and turns missing optional fields into null', async () => {
    const dto = await validate(CrewProfileDto, { ...profile, phone: '  ', unknownField: 'dropped' })
    expect(dto).toMatchObject({ firstName: 'Chai', base: 'BKK', languages: ['th', 'en'], dateOfBirth: null, email: null, phone: null })
    expect(dto).not.toHaveProperty('unknownField')
  })

  it('refuses a blank name, an unknown role and a bad email, naming each field', async () => {
    const found = await messages(validate(CrewProfileDto, { ...profile, firstName: '  ', role: 'pilot', email: 'nope' }))
    expect(found).toEqual(
      expect.arrayContaining([
        'firstName is required',
        'role must be one of captain, first_officer, cabin_crew, police',
        'email must be a valid address',
      ]),
    )
  })

  it('refuses a body that is not an object', async () => {
    await expect(validate(CrewProfileDto, 'text')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('ListCrewQueryDto', () => {
  it('reads "all" and blank as no filter', async () => {
    const query = await validate(ListCrewQueryDto, { search: '  ', base: 'all', role: 'all' }, 'query')
    expect(query).toMatchObject({ search: undefined, base: undefined, role: undefined })
  })

  it('refuses an unknown role', async () => {
    await expect(validate(ListCrewQueryDto, { role: 'pilot' }, 'query')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('CertificationDto', () => {
  it('needs a name and an expiry date', async () => {
    expect(await messages(validate(CertificationDto, { expiresOn: '2027-01-01' }))).toEqual(['name is required'])
  })
})

describe('setup-rule DTOs', () => {
  const limits = {
    minRestHours: 10,
    maxDutyHours: '13',
    maxFlightsPerDuty: 4,
    maxPairingDays: 3,
    hoursCap28d: 100,
    minLocalCrew: 1,
    minPolice: 2,
  }

  it('accepts numbers sent as numbers or numeric strings', async () => {
    expect((await validate(DefaultLimitsDto, limits)).maxDutyHours).toBe(13)
  })

  it('refuses a blank, a non-number and a negative limit', async () => {
    const found = await messages(validate(DefaultLimitsDto, { ...limits, minRestHours: '', maxDutyHours: 'x', minPolice: -1 }))
    expect(found).toEqual(
      expect.arrayContaining(['minRestHours must be a number', 'maxDutyHours must be a number', 'minPolice cannot be negative']),
    )
  })

  it('needs at least one 2-letter language, lower-cased', async () => {
    expect((await validate(CountryLanguageDto, { languages: ['JA'] })).languages).toEqual(['ja'])
    expect(await messages(validate(CountryLanguageDto, { languages: [] }))).toContain('languages must list at least one code')
    expect(await messages(validate(CountryLanguageDto, { languages: ['jpn'] }))).toEqual(['languages must be 2-letter language codes'])
  })
})

describe('build-pairing DTOs', () => {
  const window = { dateFrom: '2026-09-15', dateTo: '2026-09-19', base: 'BKK' }

  it('validates every leg of every proposal, and defaults addedManually to false', async () => {
    const dto = await validate(CommitPairingsDto, { ...window, pairings: [{ ref: 'P-108', legs: [{ flightId: ID }] }] })
    expect(dto.pairings[0].legs[0]).toMatchObject({ flightId: ID, addedManually: false })

    const found = await messages(validate(CommitPairingsDto, { ...window, pairings: [{ ref: 'P-108', legs: [{ flightId: 'x' }] }] }))
    expect(found.join(' ')).toContain('flightId must be a UUID')
  })

  it('refuses a proposal with no flights and legs that are not a list', async () => {
    expect((await messages(validate(CommitPairingsDto, { ...window, pairings: [{ ref: 'P-1', legs: [] }] }))).join(' ')).toContain(
      'a pairing needs at least one flight',
    )
    expect(await messages(validate(SaveLegsDto, { legs: 'FD1' }))).toContain('legs must be an array')
  })
})

describe('assign-crew DTOs', () => {
  it('treats a missing body as "crew the whole run"', async () => {
    expect((await validate(AutoAssignDto, undefined)).pairingIds).toEqual([])
  })

  it('accepts only UUIDs, and only true or false for demoBreaks', async () => {
    expect(await messages(validate(AutoAssignDto, { pairingIds: ['x'] }))).toEqual(['pairingIds must be UUIDs'])
    expect(await messages(validate(AutoAssignQueryDto, { demoBreaks: 'yes' }, 'query'))).toEqual(['demoBreaks must be true or false'])
  })
})

describe('fix-publish DTOs', () => {
  it('needs a written reason for an override and a sick call', async () => {
    expect(await messages(validate(OverrideDto, { reason: '   ' }))).toEqual(['reason is required'])
    expect(await messages(validate(SickCallDto, { legId: ID, memberId: 'x', reason: 'Sick' }))).toEqual(['memberId must be a UUID'])
  })
})
