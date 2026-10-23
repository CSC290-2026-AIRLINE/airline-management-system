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
  /** Always null: every fixture here is a live row, which is what the search's own filter asserts. */
  deleted_at: Date | null
  customer: { id: string; phone: string | null; created_at: Date; deleted_at: Date | null; user: { email: string } } | null
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
    deleted_at: null,
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
      deleted_at: null,
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
  $queryRawUnsafe: jest.Mock
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
    // Only a term Prisma cannot filter itself reaches this. Empty by default, so a term that
    // needs the cast matches nothing through it — which is what an empty result set means.
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
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

/**
 * The half-open day range a date token turned into, as ISO strings. The `where` Prisma is
 * handed holds real `Date` objects — a mocked client does not serialise them — so they are
 * normalised here rather than compared by identity.
 */
function dobRange(where: SearchWhere): { gte: string; lt: string } | undefined {
  const clause = alternativesFor(where).find((alt) => 'date_of_birth' in alt)
  const range = (clause?.date_of_birth ?? null) as { gte: Date; lt: Date } | null
  return range ? { gte: range.gte.toISOString(), lt: range.lt.toISOString() } : undefined
}

/** The statement and the values bound into it, for the n-th raw-SQL lookup the service made. */
function rawSqlAt(call = 0): { sql: string; values: unknown[] } {
  const [statement, ...values] = db.$queryRawUnsafe.mock.calls[call]
  return { sql: (statement as string).replace(/\s+/g, ' ').trim(), values }
}

/** Makes the raw lookup return these ids. The service reads `row.id` off what Postgres returns. */
function rawReturnsIds(ids: string[]) {
  db.$queryRawUnsafe.mockResolvedValue(ids.map((id) => ({ id })))
}

type Clause = Record<string, unknown>

/**
 * A miniature model of what Postgres does with the filter this service builds.
 *
 * Asserting the *shape* of a `where` proves the intent but not the outcome: `DbService` is
 * mocked, so nothing executes the query and no row ever comes back. This applies the generated
 * filter to fixture rows, so a test can say which people a search actually returns — the only
 * way to prove that one query matches a field *and* another, rather than stopping at the first
 * it recognises.
 *
 * It understands only the operators the search builds. Anything else throws rather than passing
 * quietly, so a filter this module grows later cannot slip past these tests unexamined.
 */
function matches(clause: object, row: SummaryRow): boolean {
  return Object.entries(clause).every(([key, value]) => {
    if (key === 'OR') {
      return (value as Clause[]).some((alternative) => matches(alternative, row))
    }
    if (key === 'AND') {
      return (value as Clause[]).every((group) => matches(group, row))
    }
    if (key === 'NOT') {
      return !matches(value as Clause, row)
    }
    if (key === 'customer') {
      return matchesCustomer(value as { is?: Clause }, row)
    }
    return matchesColumn(key, value, (row as unknown as Clause)[key])
  })
}

/** `{ customer: { is: … } }` is an existence test first and a filter second: a null relation never satisfies it. */
function matchesCustomer(clause: { is?: Clause }, row: SummaryRow): boolean {
  const holder = row.customer
  if (!holder) {
    return false
  }
  const inner = clause.is
  if (!inner || Object.keys(inner).length === 0) {
    return true
  }
  return Object.entries(inner).every(([key, value]) =>
    key === 'user'
      ? matches(value as Clause, holder.user as unknown as SummaryRow)
      : matchesColumn(key, value, (holder as unknown as Clause)[key]),
  )
}

function matchesColumn(column: string, filter: unknown, actual: unknown): boolean {
  if (actual === undefined) {
    throw new Error(`The search evaluator does not know the column "${column}".`)
  }
  if (filter === null || typeof filter !== 'object') {
    return actual === filter
  }

  const { contains, mode, in: list, gte, lt } = filter as { contains?: string; mode?: string; in?: string[]; gte?: Date; lt?: Date }

  if (list !== undefined) {
    return typeof actual === 'string' && list.includes(actual)
  }
  if (contains !== undefined) {
    // A null column compares as unknown rather than false in SQL, and an unknown is what an
    // `OR` discards — so a passenger with no Thai name is simply not a match, not an error.
    if (typeof actual !== 'string') {
      return false
    }
    // `mode: 'insensitive'` is the only case Prisma is asked for here, and it lowers both sides.
    return (mode === 'insensitive' ? actual.toLowerCase() : actual).includes(contains)
  }
  if (gte !== undefined || lt !== undefined) {
    const at = (actual as Date | null)?.getTime()
    return typeof at === 'number' && (gte === undefined || at >= gte.getTime()) && (lt === undefined || at < lt.getTime())
  }

  throw new Error(`The search evaluator cannot read the filter on "${column}": ${JSON.stringify(filter)}`)
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

/**
 * The Feature 7 search contract, field by field.
 *
 * The Artifact requires `q` to match the Latin name, the local/Thai name, the account
 * holder's email, the person id, the date of birth and the passport number, across both
 * account holders and travellers. Each case below asserts the `where` Prisma is handed,
 * because that is the actual contract with the database — a mocked `DbService` cannot
 * decide whether `contains` really filters, but it can prove the filter was asked for.
 */
describe('Customer Search — every field the Artifact requires q to match', () => {
  const ci = (term: string) => ({ contains: term, mode: 'insensitive' })

  describe('1. Latin name', () => {
    it('matches a partial first name, case-insensitively', async () => {
      const where = await whereFor('anab')

      expect(alternativesFor(where)).toContainEqual({ first_name: ci('anab') })
      expect(alternativesFor(where)).toContainEqual({ last_name: ci('anab') })
    })

    it('matches the same term whatever case it is typed in', async () => {
      for (const term of ['ANYA', 'anya', 'AnYa']) {
        expect(alternativesFor(await whereFor(term))).toContainEqual({ first_name: ci(term) })
      }
    })

    it('matches a partial surname from the middle of it', async () => {
      // "Effertz" contains "ertz"; a staff member remembers part of a name.
      expect(alternativesFor(await whereFor('ertz'))).toContainEqual({ last_name: ci('ertz') })
    })

    it('requires every term of a multi-word name, across columns', async () => {
      const where = await whereFor('Anabel Effertz')

      expect(where.AND).toHaveLength(2)
      expect(alternativesFor(where)).toContainEqual({ first_name: ci('Anabel') })
      expect(groupFor(where, 1)).toContainEqual({ last_name: ci('Effertz') })
    })
  })

  describe('2. local / Thai name', () => {
    const thai = { local_first_name: 'สมชาย', local_last_name: 'วงศ์ไพศาล' }

    it('matches the local first and last name when they are recorded', async () => {
      const where = await whereFor('สมชาย')

      expect(alternativesFor(where)).toContainEqual({ local_first_name: ci('สมชาย') })
      expect(alternativesFor(where)).toContainEqual({ local_last_name: ci('สมชาย') })
    })

    it('matches the local name even when the Latin name does not contain the term', async () => {
      // The row's Latin name is "Somchai Wong"; only the Thai spelling carries this term, so
      // the local columns are what make it findable. Every term is offered against every
      // column — matching is decided per row, not by the shape of the query — so what this
      // pins is that both local columns are searched at all.
      const alts = alternativesFor(await whereFor('ไพศาล'))

      expect(alts).toContainEqual({ local_first_name: ci('ไพศาล') })
      expect(alts).toContainEqual({ local_last_name: ci('ไพศาล') })
    })

    it('finds the row by its Thai name alone', async () => {
      db.passenger.findMany.mockResolvedValue([holderRow(thai)])
      const result = await service.search({ q: 'ไพศาล', type: 'all', page: 1, size: 20 })

      expect(result.total).toBe(1)
      expect(result.items[0]).toMatchObject({ firstName: 'Somchai', localLastName: 'วงศ์ไพศาล' })
    })

    it('carries a recorded Thai name through to the response', async () => {
      db.passenger.findMany.mockResolvedValue([holderRow(thai)])
      const result = await service.search({ q: 'สมชาย', type: 'all', page: 1, size: 20 })

      expect(result.items[0]).toMatchObject({ localFirstName: 'สมชาย', localLastName: 'วงศ์ไพศาล' })
    })
  })

  describe('3. account holder email', () => {
    it('matches the email of the holder the account belongs to', async () => {
      expect(alternativesFor(await whereFor('somchai@example.com'))).toContainEqual({
        customer: { is: { deleted_at: null, user: { email: ci('somchai@example.com') } } },
      })
    })

    it('matches part of an email, case-insensitively', async () => {
      expect(alternativesFor(await whereFor('SOMCHAI@EXAM'))).toContainEqual({
        customer: { is: { deleted_at: null, user: { email: ci('SOMCHAI@EXAM') } } },
      })
    })

    it('does not match the email of a soft-deleted account', async () => {
      // The clause is scoped to `deleted_at: null` so an old address never resurfaces a row.
      expect(alternativesFor(await whereFor('somchai@example.com'))).toContainEqual({
        customer: { is: { deleted_at: null, user: { email: ci('somchai@example.com') } } },
      })
      expect(JSON.stringify(await whereFor('somchai@example.com'))).not.toMatch(/deleted_at":\s*(?!null)/)
    })

    it('returns no email for a traveller, who has no account', async () => {
      db.passenger.findMany.mockResolvedValue([travellerRow()])
      const result = await service.search({ q: 'anya', type: 'traveller', page: 1, size: 20 })

      expect(result.items[0]).toMatchObject({ type: 'traveller', email: null })
    })
  })

  describe('4. person id', () => {
    const ID = '11111111-1111-4111-8111-111111111111'

    it('matches the id exactly', async () => {
      expect(alternativesFor(await whereFor(ID))).toContainEqual({ id: ID })
    })

    it('matches only the id, not the name or email columns', async () => {
      // A uuid cannot be a name, an email or a passport, so searching those is wasted work
      // and risks a false positive on a name that happens to contain the digits.
      expect(alternativesFor(await whereFor(ID))).toEqual([{ id: ID }])
    })

    it('does not send a non-uuid to the uuid column, which Postgres could not cast', async () => {
      const where = await whereFor('anya')

      // An id alternative may only ever be a real uuid equality or the `in` list the cast
      // produced — never the term itself handed to the column as a value.
      expect(alternativesFor(where).some((alt) => typeof alt.id === 'string')).toBe(false)
      // A 4-digit number is a year, not an id.
      expect(alternativesFor(await whereFor('1992')).some((alt) => typeof alt.id === 'string')).toBe(false)
    })
  })

  describe('5. date of birth', () => {
    it('reads the format the staff UI actually displays', async () => {
      // `formatDateOfBirth` renders `03 Aug 1992`; searching what is on screen must work.
      const where = await whereFor('03 Aug 1992')

      expect(dobRange(where)).toEqual({ gte: '1992-08-03T00:00:00.000Z', lt: '1992-08-04T00:00:00.000Z' })
    })

    it('keeps a written-out date as ONE term rather than three', async () => {
      // The bug this pins: split on whitespace, `03` and `Aug` each had to match a name,
      // so nothing ever matched and a date off the screen found nobody.
      const where = await whereFor('03 Aug 1992')

      expect(where.AND).toHaveLength(1)
    })

    it('reads the month name whatever case it is typed in', async () => {
      for (const term of ['03 aug 1992', '03 AUG 1992', '03 AuG 1992']) {
        expect(dobRange(await whereFor(term))).toEqual({ gte: '1992-08-03T00:00:00.000Z', lt: '1992-08-04T00:00:00.000Z' })
      }
    })

    it('reads the ISO form', async () => {
      expect(dobRange(await whereFor('1992-08-03'))).toEqual({ gte: '1992-08-03T00:00:00.000Z', lt: '1992-08-04T00:00:00.000Z' })
      expect(dobRange(await whereFor('1992-08'))).toEqual({ gte: '1992-08-01T00:00:00.000Z', lt: '1992-09-01T00:00:00.000Z' })
      expect(dobRange(await whereFor('1992'))).toEqual({ gte: '1992-01-01T00:00:00.000Z', lt: '1993-01-01T00:00:00.000Z' })
    })

    it('reads day-first with a slash or a dash, the order the UI input uses', async () => {
      for (const term of ['03/08/1992', '03-08-1992', '3/8/1992']) {
        expect(dobRange(await whereFor(term))).toEqual({ gte: '1992-08-03T00:00:00.000Z', lt: '1992-08-04T00:00:00.000Z' })
      }
    })

    it('reads a month name with a year, and rolls December into the next year', async () => {
      expect(dobRange(await whereFor('Aug 1992'))).toEqual({ gte: '1992-08-01T00:00:00.000Z', lt: '1992-09-01T00:00:00.000Z' })
      expect(dobRange(await whereFor('Dec 1992'))).toEqual({ gte: '1992-12-01T00:00:00.000Z', lt: '1993-01-01T00:00:00.000Z' })
    })

    it('rolls a year over into the next one', async () => {
      expect(dobRange(await whereFor('Dec 1992'))?.lt).toBe('1993-01-01T00:00:00.000Z')
    })

    it('does not read an arbitrary number as a date', async () => {
      // The user's rule: only treat a number as a date when the format supports it.
      for (const term of ['12', '03', '199', '1234', '9999']) {
        expect(dobRange(await whereFor(term))).toBeUndefined()
      }
    })

    it('does not read an impossible or misspelt date as one', async () => {
      for (const term of ['2023-02-30', '30 Feb 1992', '2023-13-01', '03 Junk 1992', '03 Zzz 1992', 'Ju 1992']) {
        expect(dobRange(await whereFor(term))).toBeUndefined()
      }
    })

    it('needs three letters before a month prefix is a month', async () => {
      // Two letters cannot separate March/May or June/July, so they are not read as a month.
      expect(dobRange(await whereFor('Ma 1992'))).toBeUndefined()
      expect(dobRange(await whereFor('Ju 1992'))).toBeUndefined()
      expect(dobRange(await whereFor('Mar 1992'))).toEqual({ gte: '1992-03-01T00:00:00.000Z', lt: '1992-04-01T00:00:00.000Z' })
    })

    it('leaves a name that merely contains a number alone', async () => {
      // "May" is a month name but with no year it is not a date, so it stays a name term.
      const where = await whereFor('May')

      expect(dobRange(where)).toBeUndefined()
      expect(alternativesFor(where)).toContainEqual({ first_name: ci('May') })
    })

    /**
     * The regression this pins. `formatDateOfBirth` renders with `Intl`'s `en-GB` short month,
     * and that abbreviation is not uniform: CLDR spells September `Sept`, four letters, so the
     * date on screen for September is `03 Sept 2012`. A parser written against three-letter
     * abbreviations silently fails on that month and finds nobody.
     *
     * Building the strings with the same `Intl` configuration the UI uses means this test
     * tracks the browser rather than restating today's answer, so a future CLDR change fails
     * here instead of in a staff member's face.
     */
    it('reads every month in the format the staff UI actually renders', async () => {
      const formatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

      for (let month = 0; month < 12; month += 1) {
        const displayed = formatter.format(new Date(Date.UTC(2012, month, 3)))
        const where = await whereFor(displayed)

        // One term, not three, and the exact day it names.
        expect(where.AND).toHaveLength(1)
        expect(dobRange(where)).toEqual({
          gte: new Date(Date.UTC(2012, month, 3)).toISOString(),
          lt: new Date(Date.UTC(2012, month, 4)).toISOString(),
        })
      }
    })

    it('reads the September abbreviation the browser renders', async () => {
      const displayed = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(Date.UTC(2012, 8, 3)),
      )

      expect(displayed).toBe('03 Sept 2012')
      expect(dobRange(await whereFor('03 Sept 2012'))).toEqual({ gte: '2012-09-03T00:00:00.000Z', lt: '2012-09-04T00:00:00.000Z' })
      // The three-letter form and the full name work too.
      expect(dobRange(await whereFor('03 Sep 2012'))).toEqual({ gte: '2012-09-03T00:00:00.000Z', lt: '2012-09-04T00:00:00.000Z' })
      expect(dobRange(await whereFor('03 September 2012'))).toEqual({ gte: '2012-09-03T00:00:00.000Z', lt: '2012-09-04T00:00:00.000Z' })
    })
  })

  describe('6. passport number', () => {
    it('matches against the stored value, which the response never carries', async () => {
      db.passenger.findMany.mockResolvedValue([travellerRow()])
      const result = await service.search({ q: 'AB1234567', type: 'all', page: 1, size: 20 })

      expect(alternativesFor(await whereFor('AB1234567'))).toContainEqual({ passport_number: ci('AB1234567') })
      // Matching happens in SQL, so a staff member can still type the real number…
      expect(result.items[0].passportNumber).toBe('•••• 4567')
      // …but the full number is not in the response anywhere.
      expect(JSON.stringify(result)).not.toContain('AB1234567')
    })

    it('matches a part of the number, since only the last four are ever on screen', async () => {
      expect(alternativesFor(await whereFor('4567'))).toContainEqual({ passport_number: ci('4567') })
    })
  })

  describe('7. the three tabs', () => {
    it('All matches both sides and filters neither', async () => {
      const where = await whereFor('anya', 'all')

      expect(where.AND).toHaveLength(1)
      expect(where.customer).toBeUndefined()
      expect(where.NOT).toBeUndefined()
    })

    it('Account holders requires an account that is not soft-deleted', async () => {
      expect((await whereFor('somchai', 'accountHolder')).customer).toEqual({ is: { deleted_at: null } })
    })

    it('Travellers is the exact complement, so a soft-deleted account is not left looking like a traveller', async () => {
      const where = await whereFor('anya', 'traveller')

      expect(where.NOT).toEqual({ customer: { is: { deleted_at: null } } })
      expect(where.customer).toBeUndefined()
    })

    it('an empty query filters on nothing and returns everything', async () => {
      const where = await whereFor('')

      expect(where.AND).toBeUndefined()
    })
  })

  describe('8. no match, and paging', () => {
    it('a term nothing matches yields a real empty page, not an error', async () => {
      db.passenger.findMany.mockResolvedValue([])
      db.passenger.count.mockResolvedValue(0)

      const result = await service.search({ q: 'zzzznomatch', type: 'all', page: 1, size: 20 })

      expect(result).toEqual({ items: [], total: 0, page: 1, size: 20 })
    })

    it('paginates with the same filter, and reports a total that is not the page length', async () => {
      db.passenger.findMany.mockResolvedValue([travellerRow()])
      db.passenger.count.mockResolvedValue(57)

      const result = await service.search({ q: 'anya', type: 'all', page: 3, size: 20 })
      const call = db.passenger.findMany.mock.calls[0][0] as { skip: number; take: number; where: { AND: unknown[] } }

      expect(call.skip).toBe(40)
      expect(call.take).toBe(20)
      // The filter travels with the page, so page 3 is the third page of matches, not of everything.
      expect(call.where.AND).toHaveLength(1)
      expect(result).toMatchObject({ total: 57, page: 3, size: 20 })
      expect(result.items).toHaveLength(1)
    })

    it('counts with the same filter as the page it counts', async () => {
      await service.search({ q: 'anya', type: 'all', page: 1, size: 20 })
      const countWhere = db.passenger.count.mock.calls[0][0] as { where: { AND: unknown[] } }
      const pageWhere = db.passenger.findMany.mock.calls[0][0] as { where: { AND: unknown[] } }

      expect(countWhere.where).toEqual(pageWhere.where)
    })
  })
})

describe('Customer Search — a partial term matches across every field', () => {
  const ci = (term: string) => ({ contains: term, mode: 'insensitive' })

  /** An id carrying `08`, as the results table displays it. */
  const ID_WITH_08 = '5a08bd81-2604-4446-930e-9edebebdd596'
  const ID_WITHOUT_08 = 'edead110-a5d3-4cfa-a6c6-eecdec4406ce'

  /**
   * Seven people, each reached by `08` through a different field, plus one that it does not
   * reach at all. The field each row is here to prove is noted beside it.
   */
  const population: SummaryRow[] = [
    // id
    travellerRow({
      id: ID_WITH_08,
      first_name: 'Maleya',
      last_name: 'Stone',
      passport_number: 'T3456789',
      date_of_birth: new Date('2018-06-21T00:00:00.000Z'),
    }),
    // day of birth
    travellerRow({
      id: 'c1e7ebca-601e-4336-8ccd-02c95606020d',
      first_name: 'Claire',
      passport_number: 'P7654321',
      date_of_birth: new Date('1991-11-08T00:00:00.000Z'),
    }),
    // month of birth
    travellerRow({
      id: 'ab649c51-2e4d-45ca-899c-8e9e7f86824e',
      first_name: 'Boris',
      passport_number: null,
      date_of_birth: new Date('1966-08-23T00:00:00.000Z'),
    }),
    // passport number
    travellerRow({
      id: 'b3dedd4e-de67-4e97-9767-3615df785a1d',
      first_name: 'Niran',
      passport_number: 'TZ0848210',
      date_of_birth: new Date('1988-03-14T00:00:00.000Z'),
    }),
    // account holder email
    holderRow({
      id: 'd16cf400-dca5-4d57-a499-135186940ad1',
      first_name: 'Pimchanok',
      passport_number: 'BR1904552',
      date_of_birth: new Date('1995-11-02T00:00:00.000Z'),
      customer: {
        id: 'c2',
        phone: null,
        created_at: new Date('2020-01-01T00:00:00.000Z'),
        deleted_at: null,
        user: { email: 'pim08@example.com' },
      },
    }),
    // name
    travellerRow({
      id: '4959c860-2278-47d0-97da-0d0734e449df',
      first_name: 'An080bel',
      last_name: 'Stone',
      passport_number: 'T1234567',
      date_of_birth: new Date('1985-04-12T00:00:00.000Z'),
    }),
    // Nothing here carries `08`, and the search must leave them out.
    travellerRow({
      id: ID_WITHOUT_08,
      first_name: 'Edith',
      last_name: 'Marsh',
      passport_number: 'V1234567',
      date_of_birth: new Date('1979-02-02T00:00:00.000Z'),
    }),
  ]

  const names = (rows: SummaryRow[]) => rows.map((row) => row.first_name)

  /** Each predicate the search can ask Postgres for, capturing the calendar part and its `$n`. */
  const PREDICATE = /EXTRACT\((YEAR|MONTH|DAY) FROM date_of_birth\) = \$(\d+)|id::text ILIKE \$(\d+)/g

  type Bound = { kind: 'YEAR' | 'MONTH' | 'DAY' | 'id'; value: unknown }

  /** Splits on a separator that is not inside parentheses, so `A OR (B AND C)` becomes two alternatives. */
  function splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (character === '(') {
        depth += 1
      } else if (character === ')') {
        depth -= 1
      } else if (depth === 0 && text.startsWith(separator, index)) {
        parts.push(text.slice(start, index))
        start = index + separator.length
        index += separator.length - 1
      }
    }
    parts.push(text.slice(start))
    return parts
  }

  function holds(row: SummaryRow, bound: Bound): boolean {
    if (bound.kind === 'id') {
      return row.id.includes(String(bound.value).replace(/^%|%$/g, ''))
    }
    const dob = row.date_of_birth
    if (!dob) {
      return false
    }
    if (bound.kind === 'YEAR') return dob.getUTCFullYear() === bound.value
    if (bound.kind === 'MONTH') return dob.getUTCMonth() + 1 === bound.value
    return dob.getUTCDate() === bound.value
  }

  /**
   * Answers the raw lookup by reading the statement the service actually sent.
   *
   * `DbService` is mocked, so nothing runs this SQL. Rather than hand-write a stand-in for it
   * — which would keep answering "yes" to a predicate the service had stopped sending — this
   * takes the predicates out of the statement it was handed, pairs each with the value its own
   * `$n` names, and returns the rows that satisfy them, honouring `AND` inside an alternative
   * and `OR` between them. Drop a predicate and its rows disappear, which is what makes the
   * row-level assertions below real rather than circular.
   *
   * Pairing by `$n` rather than by position is deliberate: it is the only way this mock can
   * notice a statement whose placeholders are numbered wrongly, which Postgres would reject
   * and a positional pairing would happily wave through.
   */
  function rawAnswersWith(rows: SummaryRow[]) {
    db.$queryRawUnsafe.mockImplementation((statement: string, ...values: unknown[]) => {
      const inner = /AND \((.*)\)$/.exec(statement.trim())?.[1] ?? ''

      // Every predicate, keyed by the `$n` it occupies, so an alternative can claim its own.
      const byOrdinal = new Map<number, Bound>()
      for (const match of inner.matchAll(PREDICATE)) {
        // Only the calendar branch captures a part; the id branch is the fallback.
        const part = match[1] === undefined ? undefined : (match[1] as 'YEAR' | 'MONTH' | 'DAY')
        const ordinal = Number(part === undefined ? match[3] : match[2])
        byOrdinal.set(ordinal, { kind: part ?? 'id', value: values[ordinal - 1] })
      }

      // Each side of an `AND` carries its own `$n`, so the number in the text says which value
      // belongs to it — no counting, and nothing to get out of step with the statement.
      const ordinalIn = (predicate: string): number | null => {
        const match = /\$(\d+)/.exec(predicate)
        return match === null ? null : Number(match[1])
      }

      const alternatives = splitTopLevel(inner, ' OR ').map((group) =>
        splitTopLevel(group.replace(/[()]/g, ''), ' AND ')
          .map((predicate) => {
            const ordinal = ordinalIn(predicate)
            return ordinal === null ? undefined : byOrdinal.get(ordinal)
          })
          .filter((entry): entry is Bound => entry !== undefined),
      )

      return Promise.resolve(
        rows
          .filter((row) => alternatives.some((alternative) => alternative.every((entry) => holds(row, entry))))
          .map((row) => ({ id: row.id })),
      )
    })
  }

  it('one query returns a match from every field, not only the first one it finds', async () => {
    rawAnswersWith(population)
    const where = await whereFor('08')

    expect(names(population.filter((row) => matches(where, row)))).toEqual([
      'Maleya', // id
      'Claire', // day
      'Boris', // month
      'Niran', // passport
      'Pimchanok', // email
      'An080bel', // name
    ])
  })

  it('returns all of them through the real response shape, so one search page carries every match', async () => {
    rawAnswersWith(population)
    const where = await whereFor('08')
    const found = population.filter((row) => matches(where, row))
    db.passenger.findMany.mockResolvedValue(found)
    db.passenger.count.mockResolvedValue(found.length)

    const result = await service.search({ q: '08', type: 'all', page: 1, size: 20 })

    expect(result.total).toBe(6)
    expect(result.items.map((item) => item.firstName)).toEqual(['Maleya', 'Claire', 'Boris', 'Niran', 'Pimchanok', 'An080bel'])
    expect(result.items.map((item) => item.id)).toEqual(found.map((row) => row.id))
  })

  it('asks Postgres for exactly the two things Prisma cannot filter, and nothing else', async () => {
    db.$queryRawUnsafe.mockResolvedValue([])
    await whereFor('08')

    expect(rawSqlAt()).toEqual({
      sql: 'SELECT id FROM passenger WHERE deleted_at IS NULL AND ((EXTRACT(DAY FROM date_of_birth) = $1) OR (EXTRACT(MONTH FROM date_of_birth) = $2) OR id::text ILIKE $3)',
      values: [8, 8, '%08%'],
    })
  })

  it('never puts the search term into the statement text', async () => {
    db.$queryRawUnsafe.mockResolvedValue([])
    await whereFor('08')
    const { sql, values } = rawSqlAt()

    expect(sql).not.toContain('08')
    expect(values).toEqual([8, 8, '%08%'])
  })

  it('numbers its placeholders the way Postgres does, so the statement is valid SQL', async () => {
    // `DbService` is mocked, so nothing here would have caught a placeholder Postgres rejects:
    // `?` is what Prisma's own `sql` tag emits and rewrites, but `$queryRawUnsafe` does no such
    // rewriting and `pg` passes the text straight through, so a `?` is a syntax error and every
    // term needing SQL fails with a 500. `$1..$n` is what the driver actually speaks.
    db.$queryRawUnsafe.mockResolvedValue([])
    await whereFor('08')

    const { sql, values } = rawSqlAt()
    expect(sql).not.toContain('?')
    expect([...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]))).toEqual([1, 2, 3])
    expect(values).toHaveLength(3)
  })

  it("numbers each term's statement from one again", async () => {
    db.$queryRawUnsafe.mockResolvedValue([])
    await whereFor('Sept 08 ab08')

    // Each term gets its own statement, so numbering must restart per call — a counter carried
    // across statements would ask for `$3` with only one value bound, and Postgres rejects that.
    const second = rawSqlAt(1)
    expect(second.sql).toContain('$1')
    expect(second.sql).not.toMatch(/\$[2-9]/)
    expect(second.values).toHaveLength(1)
  })

  it('adds the cast matches to the same alternatives, so a term still reaches every column', async () => {
    rawReturnsIds([ID_WITH_08])
    const where = await whereFor('08')

    // Every text column is still offered…
    expect(alternativesFor(where)).toEqual(
      expect.arrayContaining([
        { first_name: ci('08') },
        { last_name: ci('08') },
        { local_first_name: ci('08') },
        { local_last_name: ci('08') },
        { passport_number: ci('08') },
        { customer: { is: { deleted_at: null, user: { email: ci('08') } } } },
      ]),
    )
    // …and the ids sit beside them rather than narrowing them.
    expect(alternativesFor(where)).toContainEqual({ id: { in: [ID_WITH_08] } })
    expect(alternativesFor(where).filter((alt) => 'id' in alt)).toHaveLength(1)
  })

  it('matches nothing through the cast when the cast returns nothing', async () => {
    db.$queryRawUnsafe.mockResolvedValue([])
    const where = await whereFor('08')

    // An empty `in` is a real filter, not an absent one: it must not read as "no constraint".
    expect(alternativesFor(where)).toContainEqual({ id: { in: [] } })
  })

  it('still matches a person whose id carries the term, with no other field involved', async () => {
    rawAnswersWith(population)
    const where = await whereFor('08')

    const matched = population.filter((row) => matches(where, row))
    expect(names(matched)).toContain('Maleya')
    expect(names(matched)).not.toContain('Edith')
  })

  describe('what the id cast is allowed to run for', () => {
    it('tries the id for a fragment of a uuid', async () => {
      rawReturnsIds([ID_WITH_08])
      await whereFor('08')

      expect(rawSqlAt().sql).toContain('id::text ILIKE $3')
      expect(rawSqlAt().values).toContain('%08%')
    })

    it('does not cast for a name, a word that only looks like hex, or a single character', async () => {
      // `cafe` is hex-looking but carries no digit, and one character would match nearly every
      // uuid — neither is worth a round trip.
      for (const term of ['anya', 'Anabel', 'cafe', 'deadbeef', 'a', '0', 'Somchai']) {
        db.$queryRawUnsafe.mockClear()
        await whereFor(term)
        expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
      }
    })

    it('leaves a whole uuid to the equality that already existed', async () => {
      const where = await whereFor(ID_WITH_08)

      expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
      expect(alternativesFor(where)).toEqual([{ id: ID_WITH_08 }])
    })

    it('costs an ordinary name search nothing', async () => {
      await whereFor('Anabel Effertz')

      expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('costs an empty search nothing', async () => {
      await whereFor('')

      expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
    })
  })

  describe('partial dates', () => {
    it('reads a bare number as the day *or* the month, never as a range', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      const where = await whereFor('08')

      // A range needs a year to anchor to, and `08` has none.
      expect(dobRange(where)).toBeUndefined()
      expect(rawSqlAt().sql).toContain('(EXTRACT(DAY FROM date_of_birth) = $1) OR (EXTRACT(MONTH FROM date_of_birth) = $2)')
    })

    it('reads a month name on its own, in any year', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      await whereFor('Sept')

      expect(rawSqlAt()).toEqual({
        sql: 'SELECT id FROM passenger WHERE deleted_at IS NULL AND ((EXTRACT(MONTH FROM date_of_birth) = $1))',
        values: [9],
      })
    })

    it('reads a year on its own as a range, which Prisma can filter on its own', async () => {
      const where = await whereFor('2012')

      expect(dobRange(where)).toEqual({ gte: '2012-01-01T00:00:00.000Z', lt: '2013-01-01T00:00:00.000Z' })
    })

    it('keeps a day and a month with no year together as ONE term', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      const where = await whereFor('03 Sept')

      // Split in two, `03` and `Sept` would each have to match a name as well, which nothing does.
      expect(where.AND).toHaveLength(1)
      expect(dobRange(where)).toBeUndefined()
      expect(rawSqlAt()).toEqual({
        sql: 'SELECT id FROM passenger WHERE deleted_at IS NULL AND ((EXTRACT(MONTH FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2))',
        values: [9, 3],
      })
    })

    it('reads the month name in either order', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      await whereFor('Sept 03')

      expect(rawSqlAt().values).toEqual([9, 3])
    })

    it('reads a day inside a named year', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      await whereFor('03 2012')

      expect(rawSqlAt()).toEqual({
        sql: 'SELECT id FROM passenger WHERE deleted_at IS NULL AND ((EXTRACT(YEAR FROM date_of_birth) = $1 AND EXTRACT(DAY FROM date_of_birth) = $2))',
        values: [2012, 3],
      })
    })

    it('finds the person born on the third of September whatever their year', async () => {
      const anong = travellerRow({ id: ID_WITHOUT_08, first_name: 'Anong', date_of_birth: new Date('2012-09-03T00:00:00.000Z') })
      // The same day in another year is still a match; a different day of a different month is not.
      const alsoSeptember = travellerRow({
        id: 'c1e7ebca-601e-4336-8ccd-02c95606020d',
        first_name: 'Older',
        date_of_birth: new Date('1991-09-03T00:00:00.000Z'),
      })
      const october = travellerRow({
        id: 'ab649c51-2e4d-45ca-899c-8e9e7f86824e',
        first_name: 'October',
        date_of_birth: new Date('2012-10-03T00:00:00.000Z'),
      })
      const rows = [anong, alsoSeptember, october]
      rawAnswersWith(rows)

      const where = await whereFor('03 Sept')

      expect(names(rows.filter((row) => matches(where, row)))).toEqual(['Anong', 'Older'])
    })

    it('still refuses a number that cannot be a date', async () => {
      // `0` is neither a day nor a month, `199` is too long to be either, and `32` is past the
      // last day of the month — none may turn into a calendar part. `00` and `32` are still
      // tried against the id, because they are valid hex; what matters is that no `EXTRACT`
      // is ever asked for.
      for (const term of ['0', '199', '32', '00']) {
        db.$queryRawUnsafe.mockClear()
        await whereFor(term)
        const statements = db.$queryRawUnsafe.mock.calls.map((call) => (call[0] as string).replace(/\s+/g, ' '))
        expect(statements.filter((sql) => sql.includes('EXTRACT'))).toEqual([])
      }
      // And `0` is a single character, so it never reaches the id either.
      db.$queryRawUnsafe.mockClear()
      await whereFor('0')
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('still refuses a month prefix shorter than three letters', async () => {
      db.$queryRawUnsafe.mockClear()
      await whereFor('Ju')

      // Two letters cannot separate March/May or June/July, so `Ju` is not read as July and
      // the cast never sees a month that is not one.
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled()
    })

    it('leaves a name that is also a month alone as far as the range goes', async () => {
      // "May" is a month name, but with no year it is not a range — it stays a name term.
      const where = await whereFor('May')

      expect(dobRange(where)).toBeUndefined()
      expect(alternativesFor(where)).toContainEqual({ first_name: ci('May') })
    })
  })

  describe('what must not change', () => {
    it('keeps paging, ordering and the account-holder split on the same single query', async () => {
      rawReturnsIds([ID_WITH_08])

      await service.search({ q: '08', type: 'traveller', page: 3, size: 20 })

      const call = db.passenger.findMany.mock.calls[0][0]
      expect(call.skip).toBe(40)
      expect(call.take).toBe(20)
      expect(call.orderBy).toEqual([{ last_name: 'asc' }, { first_name: 'asc' }, { id: 'asc' }])
      expect((call.where as SearchWhere).NOT).toEqual({ customer: { is: { deleted_at: null } } })
      expect(db.passenger.count.mock.calls[0][0].where).toEqual(call.where)
    })

    it('keeps one lookup per term that needs one, so every term still has to match', async () => {
      // `Sept 08` is one partial date; `ab08` is a separate id fragment, so there are two terms
      // and two lookups. Every term still has to match, so the two id sets intersect.
      db.$queryRawUnsafe.mockResolvedValueOnce([{ id: ID_WITH_08 }]).mockResolvedValueOnce([])

      const where = await whereFor('Sept 08 ab08')

      expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(2)
      expect(where.AND).toHaveLength(2)
      expect(alternativesFor(where)).toContainEqual({ id: { in: [ID_WITH_08] } })
      expect(groupFor(where, 1)).toContainEqual({ id: { in: [] } })
    })

    it('asks for one lookup only, not one per term', async () => {
      db.$queryRawUnsafe.mockClear()

      // `08` needs a cast; `Ana` is a name and needs none.
      await whereFor('08 Ana')

      expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1)
    })

    it('never widens what the response exposes in order to make searching work', async () => {
      rawAnswersWith(population)
      db.passenger.findMany.mockResolvedValue([travellerRow({ passport_number: 'TZ0848210' })])

      const result = await service.search({ q: '08', type: 'all', page: 1, size: 20 })

      // The full number is what the search matched on and what the response must not carry.
      expect(result.items[0].passportNumber).toBe('•••• 8210')
      expect(JSON.stringify(result)).not.toContain('TZ0848210')
    })

    it('gives the account-holder route the same matching', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      db.passenger.findMany.mockClear()

      const where = (await service.searchAccountHolders({ q: 'Sept', page: 1, size: 20 }), db.passenger.findMany.mock.calls[0][0].where)

      expect(rawSqlAt().values).toEqual([9])
      expect(where).toMatchObject({ customer: { is: { deleted_at: null } } })
    })

    it('never returns a soft-deleted row through the cast', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      await whereFor('08')

      expect(rawSqlAt().sql).toContain('WHERE deleted_at IS NULL')
    })
  })

  describe('the account-holder route, which the Account holders tab reads', () => {
    it('matches the same partial term across every field the passenger route does', async () => {
      // The tab calls a different URL, so the same query has to be proved on both. A change to
      // one path that quietly narrowed the other would show up here rather than in the browser.
      rawAnswersWith(population)
      const anyType = await whereFor('08')
      const where = await whereFor('08', 'accountHolder')
      const found = population.filter((row) => matches(where, row))
      db.passenger.findMany.mockResolvedValue(found)
      db.passenger.count.mockResolvedValue(found.length)

      const result = await service.searchAccountHolders({ q: '08', page: 1, size: 20 })

      // The cast and the date parts are on this route exactly as on the passenger route — the id
      // row, the day row, the month row, the passport row and the name row all carry `08`. Only
      // `Pimchanok`, the account holder matched by email, survives this route's own split.
      expect(names(population.filter((row) => matches(anyType, row)))).toEqual([
        'Maleya',
        'Claire',
        'Boris',
        'Niran',
        'Pimchanok',
        'An080bel',
      ])
      expect(result.total).toBe(1)
      expect(result.items.map((item) => item.firstName)).toEqual(['Pimchanok'])
    })

    it('keeps the same cast statement, so the tab costs the same and cannot diverge', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      await service.searchAccountHolders({ q: '08', page: 1, size: 20 })

      expect(rawSqlAt().sql).toBe(
        'SELECT id FROM passenger WHERE deleted_at IS NULL AND ((EXTRACT(DAY FROM date_of_birth) = $1) OR (EXTRACT(MONTH FROM date_of_birth) = $2) OR id::text ILIKE $3)',
      )
      expect(rawSqlAt().values).toEqual([8, 8, '%08%'])
    })

    it('still masks the passport, on this route as much as the other', async () => {
      db.$queryRawUnsafe.mockResolvedValue([])
      db.passenger.findMany.mockResolvedValue([travellerRow({ passport_number: 'TZ0848210' })])
      db.passenger.count.mockResolvedValue(1)

      const result = await service.searchAccountHolders({ q: '08', page: 1, size: 20 })

      expect(result.items[0].passportNumber).toBe('•••• 8210')
      expect(JSON.stringify(result)).not.toContain('TZ0848210')
    })

    it('reads the September abbreviation the UI renders, on this route too', async () => {
      const anong = travellerRow({ id: ID_WITHOUT_08, first_name: 'Anong', date_of_birth: new Date('2012-09-03T00:00:00.000Z') })
      rawAnswersWith([anong])
      db.passenger.findMany.mockResolvedValue([anong])
      db.passenger.count.mockResolvedValue(1)

      // `03 Sept 2012` is exactly what `formatDateOfBirth` puts on screen for that person.
      const result = await service.searchAccountHolders({ q: '03 Sept 2012', page: 1, size: 20 })

      expect(result.items.map((item) => item.firstName)).toEqual(['Anong'])
    })
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
