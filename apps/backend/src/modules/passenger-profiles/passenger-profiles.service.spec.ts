import { BadRequestException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate, type ValidationError } from 'class-validator'
import { CorrectIdentityDto } from './dto/correct-identity.dto'
import { CreatePassengerDto } from './dto/create-passenger.dto'
import { SearchCustomersDto } from './dto/search-customers.dto'
import { SearchPassengersDto } from './dto/search-passengers.dto'
import { PassengerProfilesService } from './passenger-profiles.service'

// `DbService` is only a constructor param type, but `emitDecoratorMetadata` makes it a runtime
// reference, so the real class has to be replaced before the service module is imported.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

interface SummaryRow {
  id: string
  first_name: string
  last_name: string
  local_first_name: string | null
  local_last_name: string | null
  date_of_birth: Date | null
  gender: string | null
  nationality: string | null
  passport_number: string | null
  customer: { id: string; phone: string | null; created_at: Date; user: { email: string } } | null
}

function travellerRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    first_name: 'Anya',
    last_name: 'Petrov',
    local_first_name: null,
    local_last_name: null,
    date_of_birth: new Date('1992-08-03T00:00:00.000Z'),
    gender: 'F',
    nationality: 'th',
    passport_number: 'AB1234567',
    customer: null,
    ...overrides,
  }
}

function holderRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return travellerRow({
    id: '22222222-2222-4222-8222-222222222222',
    first_name: 'Somchai',
    last_name: 'Wong',
    customer: {
      id: 'c1',
      phone: '+66 2 000 0000',
      created_at: new Date('2021-04-01T00:00:00.000Z'),
      user: { email: 'somchai@example.com' },
    },
    ...overrides,
  })
}

const ACTOR = { id: '33333333-3333-4333-8333-333333333333', email: 'staff@example.com' }

/**
 * The `audit_log.action` CHECK constraint, copied from `schema.sql` and
 * `migrations/20261012150000_level1_schema/migration.sql`. Kept here so a test can assert
 * that whatever this module writes is actually insertable — the constraint lives in the
 * database, so a mocked `audit_log.create` would otherwise never catch a bad value.
 */
const AUDIT_ACTIONS_ALLOWED_BY_CHECK = [
  'sign_in',
  'sign_out',
  'sign_in_blocked',
  'access_denied',
  'create',
  'update',
  'delete',
  'view_sensitive',
  'role_change',
  'status_change',
  'screen_access_change',
] as const

let db: {
  passenger: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock }
  user: { findUnique: jest.Mock }
  audit_log: { create: jest.Mock }
  $transaction: jest.Mock
}
let service: PassengerProfilesService

beforeEach(() => {
  db = {
    passenger: {
      findMany: jest.fn().mockResolvedValue([travellerRow()]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(travellerRow()),
      update: jest.fn().mockImplementation(({ data }) => ({ ...travellerRow(), ...mapUpdate(data) })),
      create: jest.fn().mockImplementation(({ data }) => ({ ...travellerRow(), ...mapUpdate(data), customer: null })),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ type: 'staff' }) },
    audit_log: { create: jest.fn().mockResolvedValue({ seq: 1n }) },
    // The real client takes PrismaPromises; the mocks resolve eagerly, so awaiting the array is enough.
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
  }
  service = new PassengerProfilesService(db as never)
})

// `passenger.update` writes column names, not the camelCase the DTO uses. A correction
// only writes the three identity-lock columns, so an absent key has to be left off the
// mocked row rather than overwriting it with `undefined`.
function mapUpdate(data: Record<string, unknown>): Partial<SummaryRow> {
  const mapped: Partial<SummaryRow> = {}
  const columns: Record<string, keyof SummaryRow> = {
    first_name: 'first_name',
    last_name: 'last_name',
    local_first_name: 'local_first_name',
    local_last_name: 'local_last_name',
    date_of_birth: 'date_of_birth',
    gender: 'gender',
    nationality: 'nationality',
    passport_number: 'passport_number',
  }
  for (const [key, column] of Object.entries(columns)) {
    if (data[key] !== undefined) {
      mapped[column] = data[key] as never
    }
  }
  return mapped
}

describe('PassengerProfilesService.search', () => {
  it('never returns soft-deleted passengers and paginates from the page window', async () => {
    db.passenger.findMany.mockResolvedValue([])
    db.passenger.count.mockResolvedValue(42)

    const result = await service.search({ q: '', type: 'all', page: 3, size: 20 })

    expect(db.passenger.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null }, skip: 40, take: 20 }))
    expect(result).toEqual({ items: [], total: 42, page: 3, size: 20 })
  })

  it('labels a row as an account holder only when it has a live customer record', async () => {
    db.passenger.findMany.mockResolvedValue([holderRow(), travellerRow()])

    const { items } = await service.search({ q: '', type: 'all', page: 1, size: 20 })

    expect(items.map((item) => item.type)).toEqual(['accountHolder', 'traveller'])
    expect(items[0]).toMatchObject({ email: 'somchai@example.com', phone: '+66 2 000 0000', memberSince: new Date('2021-04-01') })
    expect(items[1]).toMatchObject({ email: null, phone: null, memberSince: null })
  })

  it('scopes a traveller search to passengers with no live account', async () => {
    await service.search({ q: '', type: 'traveller', page: 1, size: 20 })

    expect(db.passenger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deleted_at: null, NOT: { customer: { is: { deleted_at: null } } } } }),
    )
  })

  it('matches names and passport but only compares the id when the term is a UUID', async () => {
    await service.search({ q: 'anya', type: 'all', page: 1, size: 20 })
    expect(alternativesFor(whereClauseAt(0))).not.toContainEqual({ id: 'anya' })

    await service.search({ q: '11111111-1111-4111-8111-111111111111', type: 'all', page: 1, size: 20 })
    expect(alternativesFor(whereClauseAt(1))).toContainEqual({ id: '11111111-1111-4111-8111-111111111111' })
  })
})

/** The `where` Prisma was handed for a search, for the caller to make assertions against. */
interface SearchWhere {
  deleted_at: null
  /** One group per whitespace-separated term; every group must hold. */
  AND?: { OR: Record<string, unknown>[] }[]
  customer?: unknown
  NOT?: unknown
}

async function whereFor(q: string, type: 'all' | 'accountHolder' | 'traveller' = 'all'): Promise<SearchWhere> {
  db.passenger.findMany.mockClear()
  await service.search({ q, type, page: 1, size: 20 })
  return db.passenger.findMany.mock.calls[0][0].where as SearchWhere
}

function whereClauseAt(call: number): SearchWhere {
  return db.passenger.findMany.mock.calls[call][0].where as SearchWhere
}

/** The alternatives one term is allowed to match. */
function alternativesFor(where: SearchWhere): Record<string, unknown>[] {
  return where.AND?.[0]?.OR ?? []
}

/** The alternatives matched by the n-th term of a multi-term query. */
function groupFor(where: SearchWhere, index: number): Record<string, unknown>[] {
  return where.AND?.[index]?.OR ?? []
}

describe('PassengerProfilesService.search — how q is matched', () => {
  const ci = (term: string) => ({ contains: term, mode: 'insensitive' })

  it('a full name matches across separate name columns rather than one column', async () => {
    const where = await whereFor('Anabel Effertz')

    // Two terms, so two groups that must both hold. Nothing anywhere asks for a single
    // column to contain the whole phrase, which is what made this return nothing.
    expect(where.AND).toHaveLength(2)
    expect(alternativesFor(where)[0]).toEqual({ first_name: ci('Anabel') })
    expect(groupFor(where, 1)[0]).toEqual({ first_name: ci('Effertz') })
    expect(JSON.stringify(where)).not.toContain('Anabel Effertz')
  })

  it('a full name still matches when the words are in the other order', async () => {
    const where = await whereFor('Effertz Anabel')
    expect(where.AND).toHaveLength(2)
    expect(groupFor(where, 0)[0]).toEqual({ first_name: ci('Effertz') })
    expect(groupFor(where, 1)[0]).toEqual({ first_name: ci('Anabel') })
  })

  it('collapses runs of whitespace, so a padded query is still one term per word', async () => {
    const where = await whereFor('  Anabel   Effertz  ')
    expect(where.AND).toHaveLength(2)
  })

  it('keeps partial and prefix matching on the name and Thai name columns', async () => {
    const partial = await whereFor('ertz')
    expect(alternativesFor(partial)).toEqual(
      expect.arrayContaining([
        { first_name: ci('ertz') },
        { last_name: ci('ertz') },
        { local_first_name: ci('ertz') },
        { local_last_name: ci('ertz') },
        { passport_number: ci('ertz') },
      ]),
    )

    const prefix = await whereFor('An')
    expect(alternativesFor(prefix)).toContainEqual({ first_name: ci('An') })

    const thai = await whereFor('นิรัน')
    expect(alternativesFor(thai)).toContainEqual({ local_first_name: ci('นิรัน') })
  })

  it('matches an account holder by email, scoped to a live account', async () => {
    const where = await whereFor('somchai@example.com')
    expect(alternativesFor(where)).toContainEqual({
      customer: { is: { deleted_at: null, user: { email: ci('somchai@example.com') } } },
    })

    // A partial address works too, because the filter is a substring test.
    const partial = await whereFor('somchai')
    expect(alternativesFor(partial)).toContainEqual({
      customer: { is: { deleted_at: null, user: { email: ci('somchai') } } },
    })
  })

  it('matches a date of birth, a year and a month, as ranges on the date column', async () => {
    const full = await whereFor('1988-03-14')
    expect(alternativesFor(full)).toContainEqual({
      date_of_birth: { gte: new Date('1988-03-14T00:00:00.000Z'), lt: new Date('1988-03-15T00:00:00.000Z') },
    })

    const month = await whereFor('1988-03')
    expect(alternativesFor(month)).toContainEqual({
      date_of_birth: { gte: new Date('1988-03-01T00:00:00.000Z'), lt: new Date('1988-04-01T00:00:00.000Z') },
    })

    const year = await whereFor('1988')
    expect(alternativesFor(year)).toContainEqual({
      date_of_birth: { gte: new Date('1988-01-01T00:00:00.000Z'), lt: new Date('1989-01-01T00:00:00.000Z') },
    })
  })

  it('rolls December over into the next year instead of clamping', async () => {
    const where = await whereFor('1988-12')
    expect(alternativesFor(where)).toContainEqual({
      date_of_birth: { gte: new Date('1988-12-01T00:00:00.000Z'), lt: new Date('1989-01-01T00:00:00.000Z') },
    })
  })

  it('does not turn a non-date term into a range, or accept an impossible date', async () => {
    const notDates = await Promise.all(['anya', 'AB1234567', '12', '2023', 'somchai@example.com'].map((term) => whereFor(term)))
    for (const where of notDates) {
      expect(alternativesFor(where).some((clause) => 'date_of_birth' in clause)).toBe(false)
    }

    // `Date.UTC` would silently move these into the next month.
    for (const impossible of ['2023-02-30', '2023-13-01', '2023-00-10']) {
      const where = await whereFor(impossible)
      expect(alternativesFor(where).some((clause) => 'date_of_birth' in clause)).toBe(false)
    }
  })

  it('a term with no match anywhere yields a real empty result set, not an error', async () => {
    db.passenger.findMany.mockResolvedValue([])
    db.passenger.count.mockResolvedValue(0)

    const result = await service.search({ q: 'zzzzqqq', type: 'all', page: 1, size: 20 })

    expect(result).toEqual({ items: [], total: 0, page: 1, size: 20 })
    // Still a well-formed query: it must not degrade into an unbounded scan.
    expect((await whereFor('zzzzqqq')).AND).toHaveLength(1)
  })

  it('keeps the type filter alongside the term groups', async () => {
    const holder = await whereFor('Anabel', 'accountHolder')
    expect(holder.customer).toEqual({ is: { deleted_at: null } })
    expect(alternativesFor(holder)).toContainEqual({ first_name: ci('Anabel') })

    const traveller = await whereFor('Anabel', 'traveller')
    expect(traveller.NOT).toEqual({ customer: { is: { deleted_at: null } } })
    expect(alternativesFor(traveller)).toContainEqual({ first_name: ci('Anabel') })

    const all = await whereFor('Anabel', 'all')
    expect(all.customer).toBeUndefined()
    expect(all.NOT).toBeUndefined()
  })

  it('adds no term groups for a blank query, so the unfiltered list is unchanged', async () => {
    expect((await whereFor('')).AND).toBeUndefined()
    expect((await whereFor('   ')).AND).toBeUndefined()
  })

  it('keeps the id clause available on a term that is a UUID', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111'
    expect(alternativesFor(await whereFor(uuid))).toContainEqual({ id: uuid })
  })

  it('keeps the surname ordering and the page window', async () => {
    db.passenger.findMany.mockClear()
    await service.search({ q: 'Anabel Effertz', type: 'all', page: 3, size: 20 })

    expect(db.passenger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ last_name: 'asc' }, { first_name: 'asc' }, { id: 'asc' }],
        skip: 40,
        take: 20,
      }),
    )
  })
})

describe('PassengerProfilesService.create', () => {
  const dto = {
    firstName: 'Anya',
    lastName: 'Petrov',
    localFirstName: null,
    localLastName: null,
    dateOfBirth: new Date('1992-08-03T00:00:00.000Z'),
    gender: 'F' as const,
    nationality: 'th',
    passportNumber: 'AB1234567',
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('writes only the passenger row, in column names', async () => {
    const result = await service.create(dto, ACTOR)

    expect(db.passenger.create).toHaveBeenCalledWith({
      data: {
        first_name: 'Anya',
        last_name: 'Petrov',
        local_first_name: null,
        local_last_name: null,
        date_of_birth: new Date('1992-08-03T00:00:00.000Z'),
        gender: 'F',
        nationality: 'th',
        passport_number: 'AB1234567',
      },
      select: expect.any(Object),
    })
    // An account needs a `user` row that can authenticate, so a create must not invent one.
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: travellerRow().id, firstName: 'Anya', lastName: 'Petrov' })
  })

  it('returns a traveller, which is what makes the row show up under the traveller filter', async () => {
    const result = await service.create(dto, ACTOR)

    expect(result.type).toBe('traveller')
    expect(result).toMatchObject({ email: null, phone: null, memberSince: null })
  })

  it('leaves the timestamps to their column defaults rather than claiming an insert time', async () => {
    await service.create(dto, ACTOR)

    const { data } = db.passenger.create.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data).not.toHaveProperty('created_at')
    expect(data).not.toHaveProperty('updated_at')
    // `deleted_at` is what the search filter keys on, and must stay unset rather than false.
    expect(data).not.toHaveProperty('deleted_at')
  })
})

describe('PassengerProfilesService.getProfile', () => {
  it('throws NotFoundException for a missing or soft-deleted passenger', async () => {
    db.passenger.findFirst.mockResolvedValue(null)

    await expect(service.getProfile('11111111-1111-4111-8111-111111111111', ACTOR)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('reads the link table as saved travellers for an account holder', async () => {
    const saved = { relationship_type: 'Child', last_booked_at: null, passenger: travellerRow(), customer: null }
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: {
        ...holderRow().customer,
        profile_photo_url: null,
        customer_passenger: [saved],
      },
      // The wrong end of the table, and deliberately populated: reading it here
      // would list the accounts that saved this holder rather than the people
      // the holder has saved.
      customer_passenger: [],
    })

    const profile = await service.getProfile(holderRow().id, ACTOR)

    expect(profile.savedTravellers).toHaveLength(1)
    expect(profile.savedTravellers[0]).toMatchObject({ relationship: 'Child', person: { id: travellerRow().id, type: 'traveller' } })
    expect(profile.linkedAccounts).toEqual([])
  })

  it('asks for the link table from both ends, or the holder direction cannot be read', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: { ...holderRow().customer, customer_passenger: [] },
      customer_passenger: [],
    })

    await service.getProfile(holderRow().id, ACTOR)

    const { select } = db.passenger.findFirst.mock.calls[0][0] as {
      select: { customer: { select: { customer_passenger?: unknown } }; customer_passenger?: unknown }
    }
    expect(select.customer.select.customer_passenger).toBeDefined()
    expect(select.customer_passenger).toBeDefined()
  })

  it('leaves the holder out of their own saved travellers', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: {
        ...holderRow().customer,
        customer_passenger: [
          { relationship_type: 'Other', last_booked_at: null, passenger: holderRow(), customer: null },
          { relationship_type: 'Spouse', last_booked_at: null, passenger: travellerRow(), customer: null },
        ],
      },
      customer_passenger: [],
    })

    const profile = await service.getProfile(holderRow().id, ACTOR)

    expect(profile.savedTravellers).toHaveLength(1)
    expect(profile.savedTravellers[0]).toMatchObject({ relationship: 'Spouse', person: { id: travellerRow().id } })
  })

  it('reads the passenger-level link table as linked accounts for a traveller', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...travellerRow(),
      customer: null,
      customer_passenger: [
        {
          relationship_type: 'Self',
          last_booked_at: new Date('2024-02-01T00:00:00.000Z'),
          passenger: travellerRow(),
          customer: {
            id: 'c1',
            phone: '+66 2 000 0000',
            profile_photo_url: null,
            created_at: new Date('2021-04-01T00:00:00.000Z'),
            user: { email: 'somchai@example.com' },
            passenger: holderRow(),
          },
        },
      ],
    })

    const profile = await service.getProfile(travellerRow().id, ACTOR)

    expect(profile.linkedAccounts).toHaveLength(1)
    expect(profile.linkedAccounts[0]).toMatchObject({
      relationship: 'Self',
      lastBookedAt: new Date('2024-02-01T00:00:00.000Z'),
      person: { id: holderRow().id, type: 'accountHolder', email: 'somchai@example.com', phone: '+66 2 000 0000' },
    })
    expect(profile.savedTravellers).toEqual([])
  })

  it('ignores a link whose account has been soft-deleted', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...travellerRow(),
      customer: null,
      customer_passenger: [
        {
          relationship_type: 'Self',
          last_booked_at: null,
          passenger: travellerRow(),
          customer: {
            id: 'c1',
            phone: '+66 2 000 0000',
            profile_photo_url: null,
            created_at: new Date('2021-04-01T00:00:00.000Z'),
            deleted_at: new Date('2024-05-01T00:00:00.000Z'),
            user: { email: 'gone@example.com' },
            passenger: holderRow(),
          },
        },
      ],
    })

    const profile = await service.getProfile(travellerRow().id, ACTOR)

    expect(profile.linkedAccounts).toEqual([])
  })
})

describe('PassengerProfilesService masking and the view audit', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    // `getProfile` reads the link table from both ends; the shared `findFirst` mock has
    // to carry them, the same way the real row does.
    db.passenger.findFirst.mockResolvedValue({ ...travellerRow(), customer_passenger: [] })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('masks the passport in the search list, so it never reaches the browser in the clear', async () => {
    const { items } = await service.search({ q: '', type: 'all', page: 1, size: 20 })

    expect(items[0].passportNumber).toBe('•••• 4567')
  })

  it('masks the passport on a profile, and keeps a null passport null rather than inventing a mask', async () => {
    const profile = await service.getProfile(travellerRow().id, ACTOR)
    expect(profile.passportNumber).toBe('•••• 4567')

    db.passenger.findFirst.mockResolvedValue({ ...travellerRow(), passport_number: null, customer: null, customer_passenger: [] })
    expect((await service.getProfile(travellerRow().id, ACTOR)).passportNumber).toBeNull()
  })

  it('still lets a passport search term match, because matching happens in SQL', async () => {
    await service.search({ q: 'AB1234567', type: 'all', page: 1, size: 20 })

    const { where } = db.passenger.findMany.mock.calls[0][0] as { where: { AND: { OR: unknown[] }[] } }
    expect(JSON.stringify(where)).toContain('passport_number')
  })

  it('audits opening a profile as view_sensitive, with passport and DOB masked in the snapshot', async () => {
    await service.getProfile(travellerRow().id, ACTOR)

    expect(db.audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'staff',
        actor_id: ACTOR.id,
        source_feature: 'passenger-profiles',
        entity_type: 'passenger',
        entity_id: travellerRow().id,
        is_sensitive: true,
        before: expect.objectContaining({ passport_number: '•••• 4567', date_of_birth: '••••-••-03' }),
      }),
    })

    const { data } = db.audit_log.create.mock.calls[0][0] as { data: { action: string; before: Record<string, unknown> } }
    expect(data.action).toBe('view_sensitive')
    expect(AUDIT_ACTIONS_ALLOWED_BY_CHECK).toContain(data.action)
    // The Artifact requires DOB to be masked in audit entries; 1992-08-03 must not be recoverable.
    expect(JSON.stringify(data.before)).not.toContain('1992')
  })

  it('writes no audit row for a profile that does not exist', async () => {
    db.passenger.findFirst.mockResolvedValue(null)

    await expect(service.getProfile(travellerRow().id, ACTOR)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('still returns the profile when the audit write fails, rather than turning a view into a 500', async () => {
    db.audit_log.create.mockRejectedValue(new Error('audit unavailable'))

    const profile = await service.getProfile(travellerRow().id, ACTOR)
    expect(profile.id).toBe(travellerRow().id)
  })
})

/**
 * `GET /api/staff/customers` and `GET /api/staff/customers/:id`.
 *
 * These are the account-holder side of the Artifact's route table. The rules that must not
 * drift from the passenger routes: the same search semantics, the same masking, and — the one
 * that is easy to get wrong — a rejected read writing no audit row.
 */
describe('PassengerProfilesService.searchAccountHolders', () => {
  it('fixes the split to account holders, so a caller cannot ask it for travellers', async () => {
    await service.searchAccountHolders({ q: '', page: 1, size: 20 })

    const { where } = db.passenger.findMany.mock.calls[0][0] as { where: { customer: unknown } }
    expect(where.customer).toEqual({ is: { deleted_at: null } })
  })

  it('matches q exactly as the passenger route does, including every-term AND semantics', async () => {
    db.passenger.findMany.mockResolvedValue([holderRow()])
    await service.searchAccountHolders({ q: 'Anabel Effertz', page: 1, size: 20 })

    const { where } = db.passenger.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }
    expect(where.AND).toHaveLength(2)
  })

  it('pages the same way and masks the passport in every row', async () => {
    db.passenger.findMany.mockResolvedValue([holderRow()])
    const page2 = await service.searchAccountHolders({ q: '', page: 2, size: 10 })

    const call = db.passenger.findMany.mock.calls[0][0] as { skip: number; take: number }
    expect(call.skip).toBe(10)
    expect(call.take).toBe(10)
    expect(page2).toMatchObject({ page: 2, size: 10 })
    expect(page2.items[0].passportNumber).toBe('•••• 4567')
  })
})

describe('PassengerProfilesService.getAccountHolder', () => {
  beforeEach(() => {
    db.passenger.findFirst.mockResolvedValue(holderRow())
  })

  it('returns the holder profile and audits the view', async () => {
    const profile = await service.getAccountHolder(holderRow().id, ACTOR)

    expect(profile.id).toBe(holderRow().id)
    expect(profile.type).toBe('accountHolder')

    const { data } = db.audit_log.create.mock.calls[0][0] as { data: { action: string; before: Record<string, unknown> } }
    expect(data.action).toBe('view_sensitive')
    expect(AUDIT_ACTIONS_ALLOWED_BY_CHECK).toContain(data.action)
    // Masking and the DOB mask must hold here too, not only on the passenger route.
    expect(data.before).toMatchObject({ passport_number: '•••• 4567', date_of_birth: '••••-••-03' })
  })

  it('masks the passport in the profile itself', async () => {
    const profile = await service.getAccountHolder(holderRow().id, ACTOR)
    expect(profile.passportNumber).toBe('•••• 4567')
  })

  it('404s a traveller and writes no audit row for the rejected read', async () => {
    db.passenger.findFirst.mockResolvedValue(travellerRow())

    await expect(service.getAccountHolder(travellerRow().id, ACTOR)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('404s a missing passenger and writes no audit row', async () => {
    db.passenger.findFirst.mockResolvedValue(null)

    await expect(service.getAccountHolder(holderRow().id, ACTOR)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('still returns the profile when the audit write fails, rather than turning a view into a 500', async () => {
    db.audit_log.create.mockRejectedValue(new Error('audit unavailable'))

    const profile = await service.getAccountHolder(holderRow().id, ACTOR)
    expect(profile.id).toBe(holderRow().id)
  })
})

describe('SearchCustomersDto', () => {
  /**
   * The customers route takes no `type`, because it only ever answers with account holders.
   * Declaring one would advertise a parameter the route ignores, so `whitelist` has to drop it.
   */
  it('does not declare a type, so one sent by a client is dropped rather than obeyed', async () => {
    const query = await parseAs(SearchCustomersDto, { q: 'anya', type: 'traveller', page: '2', size: '50' })

    expect(query).toEqual({ q: 'anya', page: 2, size: 50 })
    expect(query).not.toHaveProperty('type')
  })

  it('normalises paging exactly as the passenger DTO does', async () => {
    expect(await parseAs(SearchCustomersDto, { page: ' 3 ', size: '25' })).toEqual({ q: '', page: 3, size: 25 })
  })

  it('rejects paging the column CHECK would refuse anyway', async () => {
    await expectRejected(SearchCustomersDto, { page: '0' }, /page/)
    await expectRejected(SearchCustomersDto, { size: '101' }, /size/)
  })
})

describe('PassengerProfilesService.correctIdentity', () => {
  // Only the three identity-lock columns are correctable, so the body carries only those.
  const body = {
    dateOfBirth: new Date('1992-08-03T00:00:00.000Z'),
    gender: 'F' as const,
    nationality: 'th',
    reason: 'Day and month were swapped at booking.',
    confirm: true as const,
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('updates the passenger and writes the audit row in one transaction', async () => {
    const result = await service.correctIdentity(travellerRow().id, body, ACTOR)

    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(db.$transaction.mock.calls[0][0]).toHaveLength(2)
    expect(db.passenger.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: travellerRow().id } }))
    expect(result).toMatchObject({ lastName: 'Petrov', type: 'traveller' })

    expect(db.audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_type: 'staff',
        actor_id: ACTOR.id,
        source_feature: 'passenger-profiles',
        entity_type: 'passenger',
        entity_id: travellerRow().id,
        reason: body.reason,
        is_sensitive: true,
      }),
    })
  })

  /**
   * `audit_log.action` is constrained by a CHECK to a shared enum, so an unlisted value
   * fails the INSERT and — because the audit row shares the transaction — rolls the
   * correction back with it. This pins the value to one the column actually accepts.
   */
  it('writes an action the audit_log CHECK constraint allows', async () => {
    await service.correctIdentity(travellerRow().id, body, ACTOR)

    const { action } = db.audit_log.create.mock.calls[0][0].data
    expect(AUDIT_ACTIONS_ALLOWED_BY_CHECK).toContain(action)
  })

  it('writes only the three identity-lock columns, leaving names and passport alone', async () => {
    await service.correctIdentity(travellerRow().id, body, ACTOR)

    const { data } = db.passenger.update.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(Object.keys(data).sort()).toEqual(['date_of_birth', 'gender', 'nationality', 'updated_at'])
  })

  it('masks the passport in the before snapshot, as the Artifact requires for audit entries', async () => {
    await service.correctIdentity(travellerRow().id, body, ACTOR)

    const { data } = db.audit_log.create.mock.calls[0][0] as {
      data: { before: { passport_number: string }; after: Record<string, unknown> }
    }
    expect(data.before.passport_number).toBe('•••• 4567')
    // The `after` half covers only the three corrected columns.
    expect(data.after).toEqual({ date_of_birth: '1992-08-03', gender: 'F', nationality: 'th' })
    // The stored value never reaches an audit row in the clear.
    expect(JSON.stringify(data)).not.toContain('AB1234567')
  })

  it('refuses a passenger that no longer exists, without opening a transaction', async () => {
    db.passenger.findFirst.mockResolvedValue(null)

    await expect(service.correctIdentity(travellerRow().id, body, ACTOR)).rejects.toBeInstanceOf(NotFoundException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses an actor with no user row, since the audit row needs an actor type', async () => {
    db.user.findUnique.mockResolvedValue(null)

    await expect(service.correctIdentity(travellerRow().id, body, ACTOR)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

/**
 * Mirrors what the global `ValidationPipe` does to one payload: normalise it through the
 * DTO's `@Transform` decorators, then run the validators. Testing this directly keeps the
 * DTO contract pinned without booting the HTTP layer, which
 * `passenger-profiles.controller.spec.ts` covers separately.
 */
async function parseAs<T extends object>(dto: new () => T, raw: unknown): Promise<T> {
  const entity = plainToInstance(dto, raw ?? {})
  const errors = await validate(entity, { whitelist: true })
  const messages = errors.flatMap((error) => flattenMessages(error))
  if (messages.length > 0) {
    throw new BadRequestException(messages)
  }
  return entity
}

function flattenMessages(error: ValidationError): string[] {
  return [...Object.values(error.constraints ?? {}), ...(error.children ?? []).flatMap((child) => flattenMessages(child))]
}

/**
 * The messages a rejected payload reports, in the same shape the HTTP layer sends them.
 *
 * `BadRequestException` keeps an array of messages in `getResponse().message` and leaves
 * `error.message` as a generic "Bad Request Exception", so `toThrow(/…/)` cannot see them.
 */
async function rejectionMessages(dto: new () => object, raw: unknown): Promise<string[]> {
  try {
    await parseAs(dto, raw)
  } catch (error) {
    if (error instanceof BadRequestException) {
      const { message } = error.getResponse() as { message: string | string[] }
      return Array.isArray(message) ? message : [message]
    }
    throw error
  }
  throw new Error(`expected ${dto.name} to reject this payload`)
}

/** Asserts the payload is rejected, and that one of the reported messages matches. */
async function expectRejected(dto: new () => object, raw: unknown, pattern: RegExp): Promise<void> {
  await expect(rejectionMessages(dto, raw)).resolves.toContainEqual(expect.stringMatching(pattern))
}

describe('SearchPassengersDto', () => {
  it('defaults the whole query', async () => {
    expect(await parseAs(SearchPassengersDto, undefined)).toEqual({ q: '', type: 'all', page: 1, size: 20 })
  })

  it('rejects an unknown type, a page below 1, and a size above the cap', async () => {
    await expectRejected(SearchPassengersDto, { type: 'admin' }, /type/)
    await expectRejected(SearchPassengersDto, { page: '0' }, /page/)
    await expectRejected(SearchPassengersDto, { size: '500' }, /size/)
    // A query parameter is always a string, so this is the SQL-injection-shaped case.
    await expectRejected(SearchPassengersDto, { page: '2; DROP TABLE passenger' }, /page/)
  })

  it('reads the page and size as numbers rather than the strings that arrive', async () => {
    const query = await parseAs(SearchPassengersDto, { page: '3', size: '50' })
    expect(query).toMatchObject({ page: 3, size: 50 })
  })
})

describe('CreatePassengerDto', () => {
  it('requires the two names, because they are the only NOT NULL columns', async () => {
    await expectRejected(CreatePassengerDto, { lastName: 'Petrov' }, /firstName/)
    await expectRejected(CreatePassengerDto, { firstName: 'Anya' }, /lastName/)
    await expectRejected(CreatePassengerDto, { firstName: '   ', lastName: 'Petrov' }, /firstName/)
    await expectRejected(CreatePassengerDto, undefined, /firstName/)
  })

  it('records every optional field as null rather than inventing a value', async () => {
    expect(await parseAs(CreatePassengerDto, { firstName: 'Anya', lastName: 'Petrov' })).toEqual({
      firstName: 'Anya',
      lastName: 'Petrov',
      localFirstName: null,
      localLastName: null,
      dateOfBirth: null,
      gender: null,
      nationality: null,
      passportNumber: null,
    })
  })

  it('normalises the gender, nationality and passport to the stored formats', async () => {
    const dto = await parseAs(CreatePassengerDto, {
      firstName: 'Anya',
      lastName: 'Petrov',
      gender: 'f',
      nationality: 'TH',
      passportNumber: 'ab-12 34567',
      dateOfBirth: '1992-08-03',
    })

    expect(dto).toMatchObject({ gender: 'F', nationality: 'th', passportNumber: 'AB1234567' })
    // `@db.Date` is stored as midnight UTC.
    expect(dto.dateOfBirth).toEqual(new Date('1992-08-03T00:00:00.000Z'))
  })

  it('rejects impossible dates and values the column CHECK would refuse anyway', async () => {
    const names = { firstName: 'Anya', lastName: 'Petrov' }
    await expectRejected(CreatePassengerDto, { ...names, dateOfBirth: '1992-02-31' }, /real date/)
    await expectRejected(CreatePassengerDto, { ...names, dateOfBirth: '03/08/1992' }, /ISO/)
    await expectRejected(CreatePassengerDto, { ...names, gender: 'Z' }, /gender/)
    await expectRejected(CreatePassengerDto, { ...names, nationality: 'tha' }, /nationality/)
    await expectRejected(CreatePassengerDto, { ...names, firstName: 42 }, /firstName/)
  })

  it('rejects a date of birth before 1900 or in the future', async () => {
    const names = { firstName: 'Anya', lastName: 'Petrov' }
    await expectRejected(CreatePassengerDto, { ...names, dateOfBirth: '1899-12-31' }, /before 1900/)
    await expectRejected(CreatePassengerDto, { ...names, dateOfBirth: '2999-01-01' }, /future/)
  })

  it('rejects a passport with characters other than letters and digits', async () => {
    const names = { firstName: 'Anya', lastName: 'Petrov' }
    await expectRejected(CreatePassengerDto, { ...names, passportNumber: 'AB#123' }, /passportNumber/)
    await expectRejected(CreatePassengerDto, { ...names, passportNumber: 'AB.123' }, /passportNumber/)
  })
})

describe('CorrectIdentityDto', () => {
  const valid = { gender: 'F', nationality: 'TH' }

  it('requires the confirmation flag and a reason', async () => {
    await expectRejected(CorrectIdentityDto, { ...valid, reason: 'typo' }, /confirm/)
    await expectRejected(CorrectIdentityDto, { ...valid, confirm: true }, /reason/)
  })

  it('normalises the gender and nationality to the stored formats', async () => {
    const dto = await parseAs(CorrectIdentityDto, { ...valid, reason: 'typo', confirm: true })

    expect(dto).toMatchObject({ gender: 'F', nationality: 'th' })
    expect(dto.dateOfBirth).toBeNull()
  })

  it('rejects impossible dates and genders the column CHECK would refuse anyway', async () => {
    await expectRejected(CorrectIdentityDto, { ...valid, dateOfBirth: '1992-02-31', reason: 'typo', confirm: true }, /real date/)
    await expectRejected(CorrectIdentityDto, { ...valid, dateOfBirth: '03/08/1992', reason: 'typo', confirm: true }, /ISO/)
    await expectRejected(CorrectIdentityDto, { ...valid, gender: 'Z', reason: 'typo', confirm: true }, /gender/)
  })

  it('rejects a date of birth before 1900 or in the future', async () => {
    await expectRejected(CorrectIdentityDto, { ...valid, dateOfBirth: '1899-12-31', reason: 'typo', confirm: true }, /before 1900/)
    await expectRejected(CorrectIdentityDto, { ...valid, dateOfBirth: '2999-01-01', reason: 'typo', confirm: true }, /future/)
  })

  /**
   * The Artifact limits a correction to date of birth, gender and nationality, and the
   * controller pipe runs with `whitelist`, so anything else in the body is dropped rather
   * than rejected. This pins that a caller cannot smuggle a name or passport change
   * through the correction route by sending the old full-restatement body.
   */
  it('does not carry names or a passport, so the correction route cannot rewrite them', () => {
    const dto = new CorrectIdentityDto()

    expect(Object.keys(dto)).not.toContain('firstName')
    expect(Object.keys(dto)).not.toContain('lastName')
    expect(Object.keys(dto)).not.toContain('localFirstName')
    expect(Object.keys(dto)).not.toContain('localLastName')
    expect(Object.keys(dto)).not.toContain('passportNumber')
  })
})
