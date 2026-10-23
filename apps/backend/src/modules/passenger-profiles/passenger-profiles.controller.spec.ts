import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { APP_ORIGINS, getRefreshCookieName } from '@backend/auth/auth.constants'
import { DbService } from '@backend/db/db.service'
import { CustomerProfilesController } from './customer-profiles.controller'
import { PassengerProfilesController } from './passenger-profiles.controller'
import { PassengerProfilesService } from './passenger-profiles.service'

// `DbService` is a constructor param type, but `emitDecoratorMetadata` makes it a runtime
// reference, so the real class has to be replaced before the service module is imported.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

// `@nestjs/jwt` ships ESM only and Jest cannot require it here. The guard is the thing under
// test, so this stands in with a real HS256 implementation rather than a stub: the happy path,
// the forged-signature path and the missing-token path all run actual crypto.
jest.mock('@nestjs/jwt', () => {
  const { createHmac, timingSafeEqual } = jest.requireActual<typeof import('node:crypto')>('node:crypto')
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const sign = (data: string) => createHmac('sha256', 'contract-test-secret-not-a-real-credential').update(data).digest('base64url')

  class JwtService {
    signAsync(payload: Record<string, unknown>, options?: { expiresIn?: number }): Promise<string> {
      const issuedAt = Math.floor(Date.now() / 1000)
      const claims = { ...payload, iat: issuedAt, exp: issuedAt + (options?.expiresIn ?? 900) }
      const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`
      return Promise.resolve(`${data}.${sign(data)}`)
    }

    verifyAsync(token: string): Promise<{ sub: string; email: string }> {
      const [header, body, signature] = token.split('.')
      if (!header || !body || !signature) {
        return Promise.reject(new Error('malformed token'))
      }
      const expected = sign(`${header}.${body}`)
      const given = Buffer.from(signature)
      const wanted = Buffer.from(expected)
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
        return Promise.reject(new Error('invalid signature'))
      }
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as { sub: string; email: string; exp?: number }
      if (claims.exp !== undefined && claims.exp * 1000 < Date.now()) {
        return Promise.reject(new Error('token expired'))
      }
      return Promise.resolve({ sub: claims.sub, email: claims.email })
    }
  }

  return { JwtService }
})

/**
 * HTTP contract for the three Customer Search endpoints.
 *
 * `passenger-profiles.service.spec.ts` covers the query building; this file covers what
 * goes over the wire, which is the half the staff-web client depends on and cannot see:
 * the `/api` prefix, the global bearer-token guard, and — most importantly — how `Date`
 * and `null` values are serialized. The client reduces `dateOfBirth` with a string slice
 * and falls back to an em dash for `null`, so a shape change here breaks the UI silently.
 *
 * Per `apps/backend/CLAUDE.md`, tests must not need a live database or Clerk, so `DbService`
 * is mocked and the token is signed with a local throwaway secret.
 */

const ACTOR = { sub: '33333333-3333-4333-8333-333333333333', email: 'staff@example.com' }

const TRAVELLER_ID = '11111111-1111-4111-8111-111111111111'
const HOLDER_ID = '22222222-2222-4222-8222-222222222222'

/**
 * The `audit_log.action` CHECK constraint, copied from `schema.sql`. Kept here so a test can
 * assert the action this module writes is actually insertable — the constraint lives in the
 * database, so a mocked `audit_log.create` would never catch an unlisted value on its own.
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
]

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
    id: TRAVELLER_ID,
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
    id: HOLDER_ID,
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

/** A `customer_passenger` link row, as the `LINK_SELECT` above the service reads it. */
function linkRow(relationship: string, lastBookedAt: Date | null, deletedAt: Date | null = null) {
  return {
    relationship_type: relationship,
    last_booked_at: lastBookedAt,
    passenger: travellerRow({ id: '44444444-4444-4444-8444-444444444444', first_name: 'Niran', last_name: 'Petrov' }),
    customer: {
      id: 'c1',
      phone: '+66 2 000 0000',
      profile_photo_url: 'https://example.test/a.png',
      created_at: new Date('2021-04-01T00:00:00.000Z'),
      deleted_at: deletedAt,
      user: { email: 'somchai@example.com' },
      passenger: holderRow(),
    },
  }
}

interface FakeDb {
  passenger: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock; update: jest.Mock; create: jest.Mock }
  user: { findUnique: jest.Mock }
  audit_log: { create: jest.Mock }
  $transaction: jest.Mock
}

function makeDb(): FakeDb {
  return {
    passenger: {
      findMany: jest.fn().mockResolvedValue([travellerRow(), holderRow()]),
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue(travellerRow()),
      update: jest.fn().mockResolvedValue(travellerRow()),
      // Echoes what was written, so the response reflects the body rather than a fixed row.
      create: jest.fn().mockImplementation(({ data }) => ({
        ...travellerRow(),
        ...(data as Partial<SummaryRow>),
        customer: null,
      })),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ type: 'staff' }) },
    audit_log: { create: jest.fn().mockResolvedValue({ seq: 1n }) },
    $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
  }
}

// Built before the testing module is compiled, because the provider is handed the object
// itself. `beforeEach` resets it in place so the injected reference stays valid.
const db: FakeDb = makeDb()

let app: INestApplication
let token: string

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [PassengerProfilesController, CustomerProfilesController],
    providers: [PassengerProfilesService, { provide: DbService, useValue: db }, JwtService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  }).compile()

  app = moduleRef.createNestApplication()
  // Mirrors `main.ts`; the frontend builds its paths from the same prefix.
  app.setGlobalPrefix('api')
  // Deliberately no `useGlobalPipes`: `main.ts` does not register one, and this controller
  // carries its own `@UsePipes`. Registering a global pipe here would hide a missing
  // feature-scoped one, which is the mistake this file exists to prevent.
  // Also mirrors `main.ts`. staff-web runs on a different port, so without this the browser
  // drops every response — and `credentials: 'include'` needs the exact origin echoed back.
  app.enableCors({ origin: Object.keys(APP_ORIGINS), credentials: true })
  await app.init()

  // Signed through the same service the guard verifies against.
  token = await moduleRef.get(JwtService).signAsync(ACTOR)
})

beforeEach(() => {
  Object.assign(db, makeDb())
})

afterAll(async () => {
  await app?.close()
})

const asJson = (res: request.Response) => JSON.parse(res.text) as Record<string, unknown>

/**
 * The `message` a client would render. `ValidationPipe` reports one entry per failed rule,
 * so it is an array; `lib/api.ts` takes the first. Mirrors that rather than asserting the
 * body shape directly, so this keeps testing the contract the UI depends on.
 */
function firstMessage(body: Record<string, unknown>): unknown {
  const { message } = body
  return Array.isArray(message) ? message[0] : message
}

describe('GET /api/staff/passengers', () => {
  it('rejects a request with no access token', async () => {
    await request(app.getHttpServer()).get('/api/staff/passengers').expect(401)
  })

  it('rejects a token signed with a different secret', async () => {
    await request(app.getHttpServer()).get('/api/staff/passengers').set('Authorization', 'Bearer not.a.valid.token').expect(401)
  })

  it('returns the search envelope the client paginates from', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/staff/passengers?q=pet&type=all&page=1&size=8')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = asJson(res)
    expect(body).toMatchObject({ total: 2, page: 1, size: 8 })
    expect(body.items).toHaveLength(2)
  })

  // The client slices `dateOfBirth` with `.slice(0, 10)`; a bare `yyyy-mm-dd` would
  // still work, but a Date object would not survive JSON at all.
  it('serializes date fields as ISO strings, and account holders carry their own contact details', async () => {
    const res = await request(app.getHttpServer()).get('/api/staff/passengers').set('Authorization', `Bearer ${token}`).expect(200)

    const items = asJson(res).items as Array<Record<string, unknown>>
    expect(items[0].dateOfBirth).toBe('1992-08-03T00:00:00.000Z')
    expect(items[1].memberSince).toBe('2021-04-01T00:00:00.000Z')
    expect(items[1]).toMatchObject({
      type: 'accountHolder',
      email: 'somchai@example.com',
      phone: '+66 2 000 0000',
    })
    // A traveller has no account, so these are null rather than absent or invented.
    expect(items[0]).toMatchObject({ type: 'traveller', email: null, phone: null, memberSince: null })
  })

  it('keeps an absent value as null so the client can render an em dash', async () => {
    db.passenger.findMany.mockResolvedValue([travellerRow({ date_of_birth: null, gender: null, nationality: null })])
    db.passenger.count.mockResolvedValue(1)

    const res = await request(app.getHttpServer()).get('/api/staff/passengers').set('Authorization', `Bearer ${token}`).expect(200)

    const [row] = asJson(res).items as Array<Record<string, unknown>>
    expect(row.dateOfBirth).toBeNull()
    expect(row.gender).toBeNull()
    expect(row.nationality).toBeNull()
    // The keys must still be present, or the client's `.nationality` access throws.
    expect(row).toHaveProperty('nationality')
  })

  it('answers a bad query parameter with a 400 the client can read', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/staff/passengers?page=0&size=1000&type=bogus')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)

    // `lib/api.ts` reads `message` out of the Nest error body and shows it to the user.
    // The `ValidationPipe` reports one message per failed rule, so `message` is an array
    // and the client takes the first entry.
    expect(firstMessage(asJson(res))).toEqual(expect.any(String))
  })

  it('reports zero results as an empty list rather than a 404', async () => {
    db.passenger.findMany.mockResolvedValue([])
    db.passenger.count.mockResolvedValue(0)

    const res = await request(app.getHttpServer()).get('/api/staff/passengers?q=nobody').set('Authorization', `Bearer ${token}`).expect(200)
    expect(asJson(res)).toMatchObject({ items: [], total: 0 })
  })
})

describe('POST /api/staff/passengers', () => {
  const validBody = {
    firstName: 'Anya',
    lastName: 'Petrov',
    localFirstName: null,
    localLastName: null,
    dateOfBirth: '1992-08-03',
    gender: 'F',
    nationality: 'th',
    passportNumber: 'AB1234567',
  }

  it('rejects a request with no access token', async () => {
    await request(app.getHttpServer()).post('/api/staff/passengers').send(validBody).expect(401)
    expect(db.passenger.create).not.toHaveBeenCalled()
  })

  it('answers 201 with the summary the client can render straight away', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff/passengers')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(201)

    expect(asJson(res)).toMatchObject({ id: TRAVELLER_ID, firstName: 'Anya', lastName: 'Petrov', type: 'traveller' })
    // The date column is `@db.Date`, so it must survive JSON as an ISO string.
    expect(asJson(res).dateOfBirth).toBe('1992-08-03T00:00:00.000Z')
  })

  it('normalises the body to the stored formats before it reaches the database', async () => {
    await request(app.getHttpServer())
      .post('/api/staff/passengers')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, gender: 'f', nationality: 'TH', passportNumber: 'ab-12 34567' })
      .expect(201)

    // The service writes column names, not the camelCase the body used.
    expect(db.passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gender: 'F', nationality: 'th', passport_number: 'AB1234567' }),
      }),
    )
  })

  it('creates a passenger and nothing else, so the row reads as a traveller', async () => {
    await request(app.getHttpServer()).post('/api/staff/passengers').set('Authorization', `Bearer ${token}`).send(validBody).expect(201)

    // No `user` and no `customer` row: an account needs a login that can actually authenticate.
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('accepts a body of only the two required names', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff/passengers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Niran', lastName: 'Petrov' })
      .expect(201)

    expect(db.passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ date_of_birth: null, gender: null, nationality: null, passport_number: null }),
      }),
    )
    expect(asJson(res).nationality).toBeNull()
  })

  it('answers 400 without writing anything when a required name is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff/passengers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Anya' })
      .expect(400)

    expect(db.passenger.create).not.toHaveBeenCalled()
    expect(firstMessage(asJson(res))).toEqual(expect.any(String))
  })

  it('answers 400 for a body the database would reject anyway', async () => {
    const send = (body: Record<string, unknown>) =>
      request(app.getHttpServer()).post('/api/staff/passengers').set('Authorization', `Bearer ${token}`).send(body).expect(400)

    await send({ ...validBody, dateOfBirth: '1992-02-31' })
    await send({ ...validBody, gender: 'Z' })
    await send({ ...validBody, nationality: 'tha' })
    await send({ ...validBody, firstName: 42 })

    expect(db.passenger.create).not.toHaveBeenCalled()
  })

  it('does not collide with the profile route', async () => {
    await request(app.getHttpServer()).post('/api/staff/passengers').set('Authorization', `Bearer ${token}`).expect(400)
    expect(db.passenger.findFirst).not.toHaveBeenCalled()
  })
})

/**
 * `GET /api/staff/customers` and `GET /api/staff/customers/:id` — the account-holder half of
 * the Artifact's route table.
 *
 * These assert the *exact URLs the staff-web client builds*, including the `/api` global
 * prefix, because the client calls these two routes directly and a silent path drift here
 * would surface only as an empty Account holders tab at runtime.
 */
describe('GET /api/staff/customers', () => {
  it('serves the account holders at the path the client calls, and masks the passport', async () => {
    db.passenger.findMany.mockResolvedValue([holderRow()])
    db.passenger.count.mockResolvedValue(1)

    const res = await request(app.getHttpServer())
      .get('/api/staff/customers?q=effertz&page=1&size=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(asJson(res)).toMatchObject({ total: 1, page: 1, size: 20, items: [{ id: HOLDER_ID, passportNumber: '•••• 4567' }] })
    // The split is fixed server-side, so the query carries no `type` clause at all.
    const { where } = db.passenger.findMany.mock.calls[0][0] as { where: { customer: unknown } }
    expect(where.customer).toEqual({ is: { deleted_at: null } })
  })

  it('requires a Bearer token, like every other route in this module', async () => {
    await request(app.getHttpServer()).get('/api/staff/customers').expect(401)
  })

  it('ignores a `type` a client sends rather than obeying it', async () => {
    db.passenger.findMany.mockResolvedValue([holderRow()])

    await request(app.getHttpServer()).get('/api/staff/customers?type=traveller').set('Authorization', `Bearer ${token}`).expect(200)

    const { where } = db.passenger.findMany.mock.calls[0][0] as { where: { customer: unknown } }
    expect(where.customer).toEqual({ is: { deleted_at: null } })
  })

  it('rejects a page or size the DTO caps, proving the controller pipe is actually attached', async () => {
    await request(app.getHttpServer()).get('/api/staff/customers?page=0').set('Authorization', `Bearer ${token}`).expect(400)
    await request(app.getHttpServer()).get('/api/staff/customers?size=500').set('Authorization', `Bearer ${token}`).expect(400)
  })
})

describe('GET /api/staff/customers/:id', () => {
  it('returns the holder profile the client expects, with the passport masked', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: { ...holderRow().customer, customer_passenger: [] },
      customer_passenger: [],
    })

    const res = await request(app.getHttpServer())
      .get(`/api/staff/customers/${HOLDER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(asJson(res)).toMatchObject({ id: HOLDER_ID, type: 'accountHolder', passportNumber: '•••• 4567' })
  })

  it('rejects an id that is not a UUID before it reaches Postgres', async () => {
    await request(app.getHttpServer()).get('/api/staff/customers/not-a-uuid').set('Authorization', `Bearer ${token}`).expect(400)
  })

  it('404s a traveller and writes no audit row for the rejected read', async () => {
    db.passenger.findFirst.mockResolvedValue({ ...travellerRow(), customer: null, customer_passenger: [] })

    await request(app.getHttpServer()).get(`/api/staff/customers/${TRAVELLER_ID}`).set('Authorization', `Bearer ${token}`).expect(404)
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('audits a successful open as view_sensitive', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: { ...holderRow().customer, customer_passenger: [] },
      customer_passenger: [],
    })

    await request(app.getHttpServer()).get(`/api/staff/customers/${HOLDER_ID}`).set('Authorization', `Bearer ${token}`).expect(200)

    const { data } = db.audit_log.create.mock.calls[0][0] as { data: { action: string } }
    expect(data.action).toBe('view_sensitive')
  })
})

describe('GET /api/staff/passengers/:id', () => {
  it('rejects an id that is not a UUID before it reaches Postgres', async () => {
    await request(app.getHttpServer()).get('/api/staff/passengers/not-a-uuid').set('Authorization', `Bearer ${token}`).expect(400)
  })

  it('reads the link table as saved travellers for an account holder', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      profile_photo_url: 'https://example.test/a.png',
      // Keyed on the customer: these are the people this account books for.
      customer: {
        ...holderRow().customer,
        customer_passenger: [linkRow('Son', new Date('2026-08-14T09:00:00.000Z'))],
      },
      customer_passenger: [],
    })

    const res = await request(app.getHttpServer())
      .get(`/api/staff/passengers/${HOLDER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = asJson(res)
    const [saved] = body.savedTravellers as Array<Record<string, unknown>>
    expect(body.linkedAccounts).toEqual([])
    expect(saved).toMatchObject({ relationship: 'Son', lastBookedAt: '2026-08-14T09:00:00.000Z' })
    // Each link carries a whole person, so the client no longer needs the list to resolve ids.
    expect((saved.person as Record<string, unknown>).lastName).toBe('Petrov')
  })

  it('reads the same table as linked accounts for a traveller, with the holder contact details', async () => {
    db.passenger.findFirst.mockResolvedValue({ ...travellerRow(), customer_passenger: [linkRow('Mother', null)] })

    const res = await request(app.getHttpServer())
      .get(`/api/staff/passengers/${TRAVELLER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const body = asJson(res)
    const [link] = body.linkedAccounts as Array<Record<string, unknown>>
    expect(body.savedTravellers).toEqual([])
    expect(link).toMatchObject({ relationship: 'Mother', lastBookedAt: null })
    // A never-booked link is null, which the detail view renders as "never booked".
    expect((link.person as Record<string, unknown>).email).toBe('somchai@example.com')
  })

  it('answers 404 for a passenger that is missing or soft-deleted', async () => {
    db.passenger.findFirst.mockResolvedValue(null)
    await request(app.getHttpServer()).get(`/api/staff/passengers/${TRAVELLER_ID}`).set('Authorization', `Bearer ${token}`).expect(404)
  })

  /**
   * `customer_passenger.customer` is required, so Prisma offers no filtered relation read
   * there and the soft-delete check runs in the service instead. This pins that it still runs:
   * a deleted account must not reappear as a linked account.
   */
  it('drops a link whose account has been soft-deleted', async () => {
    db.passenger.findFirst.mockResolvedValue({
      ...travellerRow(),
      customer_passenger: [linkRow('Mother', null, new Date('2026-01-09T00:00:00.000Z'))],
    })

    const res = await request(app.getHttpServer())
      .get(`/api/staff/passengers/${TRAVELLER_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(asJson(res).linkedAccounts).toEqual([])
  })

  /**
   * Regression guard for the 500 this screen used to show. Prisma rejects `where` inside the
   * select of a *required* to-one relation, so `LINK_SELECT.customer` must never grow one
   * back; the shape is asserted here because a bad select only fails at request time.
   */
  it('never asks for a filtered relation read on the required customer relation', async () => {
    db.passenger.findFirst.mockResolvedValue({ ...holderRow(), customer_passenger: [linkRow('Son', null)] })

    await request(app.getHttpServer()).get(`/api/staff/passengers/${HOLDER_ID}`).set('Authorization', `Bearer ${token}`).expect(200)

    const [select] = db.passenger.findFirst.mock.calls[0] as [{ select: { customer_passenger: { select: { customer: object } } } }]
    expect(select.select.customer_passenger.select.customer).not.toHaveProperty('where')
  })
})

describe('PUT /api/staff/passengers/:id/identity', () => {
  // Only the three identity-lock columns are correctable, so the body carries only those.
  const validBody = {
    dateOfBirth: '1992-03-08',
    gender: 'F',
    nationality: 'th',
    reason: 'Day and month were swapped at booking; passport checked at counter',
    confirm: true,
  }

  it('rejects a body without the confirmation flag', async () => {
    // `undefined` is dropped by JSON serialization, so the key is genuinely absent.
    await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, confirm: undefined })
      .expect(400)
  })

  it('rejects a nationality the column could never store', async () => {
    await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, nationality: 'other' })
      .expect(400)
  })

  it('returns the summary the client re-renders, with the date serialized and the passport masked', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(200)

    const body = asJson(res)
    expect(body).toMatchObject({ id: TRAVELLER_ID, lastName: 'Petrov' })
    expect(body.dateOfBirth).toBe('1992-08-03T00:00:00.000Z')
    // A correction leaves the passport alone, and the response masks it like every other.
    expect(body.passportNumber).toBe('•••• 4567')
  })

  /**
   * The Artifact scopes a correction to date of birth, gender and nationality. A client
   * still sending the old full-record body has its names and passport dropped by the
   * pipe, so the route cannot be used to rewrite them.
   */
  it('ignores a name or passport sent in the body, leaving the stored row untouched', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validBody, firstName: 'Smuggled', lastName: 'Name', passportNumber: 'ZZ9999999' })
      .expect(200)

    expect(asJson(res)).toMatchObject({ firstName: 'Anya', lastName: 'Petrov' })
    expect(db.passenger.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ first_name: expect.anything(), passport_number: expect.anything() }) }),
    )
  })

  it('takes the actor from the bearer token, never from the body', async () => {
    await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      // A spoofed actor in the payload must be ignored.
      .send({ ...validBody, actor_id: 'attacker', actor_type: 'admin' })
      .expect(200)

    expect(db.audit_log.create).toHaveBeenCalledTimes(1)
    expect(db.audit_log.create.mock.calls[0][0].data).toMatchObject({
      actor_id: ACTOR.sub,
      actor_type: 'staff',
      entity_id: TRAVELLER_ID,
      is_sensitive: true,
    })
    // The correction and its audit row are written together or not at all.
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  /**
   * The regression this module's action value caused. `audit_log.action` is constrained by
   * a CHECK to a shared enum; an unlisted value fails the INSERT, and because the audit row
   * shares the transaction with the update, the whole correction rolled back with a 500.
   */
  it('writes an action the audit_log CHECK allows, so the correction is not rolled back', async () => {
    await request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
      .expect(200)

    const { action } = db.audit_log.create.mock.calls[0][0].data
    expect(AUDIT_ACTIONS_ALLOWED_BY_CHECK).toContain(action)
  })
})

/**
 * The validation contract this module relies on, asserted over HTTP.
 *
 * The controller registers its own `@UsePipes`, and `main.ts` registers no global pipe,
 * so these tests are the only thing standing between a missing `@UsePipes` and a silently
 * unvalidated API: the suite above would otherwise pass with an inert controller. Each
 * case here fails if the pipe is removed.
 */
/**
 * The complete route contract, as the Artifact states it.
 *
 * Each row names the method and full URL the staff-web client builds, including the `/api`
 * global prefix from `main.ts`. `fetchWithAuth` prefixes only the API origin, so a path that
 * lost or gained `/api` here would 404 in the browser and nowhere else.
 *
 * The negative rows matter as much as the positive ones: the old `PATCH .../identity` route
 * was removed rather than kept as an alias, so these pin that it is really gone instead of
 * quietly answering alongside the `PUT`.
 */
describe('route contract — method and URL for every Feature 7 request', () => {
  const AUTH = () => ({ Authorization: `Bearer ${token}` })
  const ID = '22222222-2222-4222-8222-222222222222'

  beforeEach(() => {
    db.passenger.findMany.mockResolvedValue([holderRow()])
    db.passenger.count.mockResolvedValue(1)
    db.passenger.findFirst.mockResolvedValue({
      ...holderRow(),
      customer: { ...holderRow().customer, customer_passenger: [] },
      customer_passenger: [],
    })
  })

  it('serves each documented route at exactly the method and URL the client calls', async () => {
    const server = app.getHttpServer()

    // GET /staff/customers
    await request(server).get('/api/staff/customers').set(AUTH()).expect(200)
    // GET /staff/customers/:id
    await request(server).get(`/api/staff/customers/${ID}`).set(AUTH()).expect(200)
    // GET /staff/passengers
    await request(server).get('/api/staff/passengers').set(AUTH()).expect(200)
    // POST /staff/passengers
    await request(server).post('/api/staff/passengers').set(AUTH()).send({ firstName: 'A', lastName: 'B' }).expect(201)
    // GET /staff/passengers/:id
    await request(server).get(`/api/staff/passengers/${ID}`).set(AUTH()).expect(200)
    // PUT /staff/passengers/:id/identity
    await request(server)
      .put(`/api/staff/passengers/${ID}/identity`)
      .set(AUTH())
      .send({ dateOfBirth: '1992-08-03', gender: 'F', nationality: 'th', reason: 'spelling fixed', confirm: true })
      .expect(200)
  })

  it('no longer answers the old PATCH identity route', async () => {
    // A 404 rather than a 405: the handler was removed, not left behind to reject the verb.
    await request(app.getHttpServer())
      .patch(`/api/staff/passengers/${ID}/identity`)
      .set(AUTH())
      .send({ reason: 'spelling fixed', confirm: true })
      .expect(404)
  })

  it('no longer answers the pre-rename /api/passengers paths', async () => {
    await request(app.getHttpServer()).get('/api/passengers').set(AUTH()).expect(404)
    await request(app.getHttpServer()).get(`/api/passengers/${ID}`).set(AUTH()).expect(404)
  })

  it('no longer answers /api/passengers/:id/identity under any verb', async () => {
    const server = app.getHttpServer()
    const body = { reason: 'spelling fixed', confirm: true }

    await request(server).put(`/api/passengers/${ID}/identity`).set(AUTH()).send(body).expect(404)
    await request(server).patch(`/api/passengers/${ID}/identity`).set(AUTH()).send(body).expect(404)
  })

  it('requires a Bearer token on every route, including the account-holder ones', async () => {
    const server = app.getHttpServer()
    // Each method is paired with a path that actually declares it: Nest resolves the route
    // before the guard runs, so a verb a controller does not declare is a 404, not a 401.
    const guarded: [string, string][] = [
      ['get', '/api/staff/customers'],
      ['get', `/api/staff/customers/${ID}`],
      ['get', '/api/staff/passengers'],
      ['post', '/api/staff/passengers'],
      ['get', `/api/staff/passengers/${ID}`],
      ['put', `/api/staff/passengers/${ID}/identity`],
    ]

    for (const [method, path] of guarded) {
      await request(server)[method](path).expect(401)
    }
  })
})

describe('Customer Search validation (controller-scoped ValidationPipe)', () => {
  const validCreate = { firstName: 'Anya', lastName: 'Petrov' }
  const validIdentity = {
    dateOfBirth: '1992-03-08',
    gender: 'F',
    nationality: 'th',
    reason: 'Day and month were swapped at booking',
    confirm: true,
  }

  const post = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/staff/passengers')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object)
  const put = (body: unknown) =>
    request(app.getHttpServer())
      .put(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object)

  it('accepts a valid body, normalises it, and stores the normalised values', async () => {
    await post({ ...validCreate, gender: 'f', nationality: 'TH', passportNumber: 'ab-12 34567' }).expect(201)

    expect(db.passenger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gender: 'F', nationality: 'th', passport_number: 'AB1234567' }),
      }),
    )
  })

  it('accepts a valid query and coerces the page and size to numbers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/staff/passengers?q=pet&type=all&page=2&size=8')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(asJson(res)).toMatchObject({ page: 2, size: 8 })
  })

  it.each([
    ['a body missing a required name', { firstName: 'Anya' }],
    ['a name that is not a string', { ...validCreate, firstName: 42 }],
    ['an impossible date of birth', { ...validCreate, dateOfBirth: '1992-02-31' }],
    ['a date that is not ISO', { ...validCreate, dateOfBirth: '03/08/1992' }],
    ['a gender outside the column CHECK', { ...validCreate, gender: 'Z' }],
    ['a three-letter nationality', { ...validCreate, nationality: 'tha' }],
  ])('answers 400 for %s, without writing anything', async (_case, body) => {
    await post(body).expect(400)
    expect(db.passenger.create).not.toHaveBeenCalled()
  })

  it('answers 400 for a query outside the documented bounds', async () => {
    const get = (query: string) => request(app.getHttpServer()).get(`/api/staff/passengers${query}`).set('Authorization', `Bearer ${token}`)

    await get('?page=0').expect(400)
    await get('?size=1000').expect(400)
    await get('?type=admin').expect(400)
  })

  it('drops properties the DTO does not declare instead of trusting or rejecting them', async () => {
    // `whitelist: true` strips unknown keys rather than 400-ing on them, so a client that
    // sends an extra field still succeeds and the field cannot reach the database.
    await post({ ...validCreate, role: 'admin', deleted_at: '2000-01-01' }).expect(201)

    const written = db.passenger.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(written.data).not.toHaveProperty('role')
    expect(written.data).not.toHaveProperty('deleted_at')
  })

  it('never lets a spoofed actor in the body reach the audit row', async () => {
    db.passenger.findFirst.mockResolvedValue({ ...travellerRow() })
    await put({ ...validIdentity, actor_id: 'attacker', actor_type: 'admin' }).expect(200)

    expect(db.audit_log.create.mock.calls[0][0].data).toMatchObject({ actor_id: ACTOR.sub, actor_type: 'staff' })
  })

  it('rejects a correction that omits the confirmation flag, so nothing is written', async () => {
    await put({ ...validIdentity, confirm: undefined }).expect(400)

    expect(db.passenger.update).not.toHaveBeenCalled()
    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('rejects a correction with no reason, since the audit row would have nothing to justify it', async () => {
    await put({ ...validIdentity, reason: '   ' }).expect(400)

    expect(db.audit_log.create).not.toHaveBeenCalled()
  })

  it('reports a rejected body as a 400 the client can render', async () => {
    const res = await post({ firstName: 'Anya' }).expect(400)

    expect(firstMessage(asJson(res))).toEqual(expect.any(String))
  })
})

/**
 * staff-web runs on a different port from the API, so every response has to survive the
 * browser's CORS check — including the 401s, otherwise the frontend shows a generic
 * network error instead of "your session has expired".
 */
describe('CORS for the staff-web origin', () => {
  const STAFF_ORIGIN = 'http://localhost:6161'

  it('allows the staff-web origin by default, with a cookie scoped to that app', () => {
    expect(Object.keys(APP_ORIGINS)).toContain(STAFF_ORIGIN)
    // Separate cookie per app, so the two frontends never share a session.
    expect(getRefreshCookieName(STAFF_ORIGIN)).toBe('refresh_token_staff')
    expect(getRefreshCookieName('http://localhost:5151')).toBe('refresh_token_customer')
  })

  it('answers the browser preflight with credentials allowed', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/staff/passengers')
      .set('Origin', STAFF_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)

    expect(res.headers['access-control-allow-origin']).toBe(STAFF_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('allows the PUT preflight the correction dialog needs', async () => {
    const res = await request(app.getHttpServer())
      .options(`/api/staff/passengers/${TRAVELLER_ID}/identity`)
      .set('Origin', STAFF_ORIGIN)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204)

    expect(res.headers['access-control-allow-origin']).toBe(STAFF_ORIGIN)
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('authorization')
  })

  it('withholds the allow-origin header from an origin that is not on the list', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/staff/passengers')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('still sends CORS headers on a 401, so the client can read the error body', async () => {
    const res = await request(app.getHttpServer()).get('/api/staff/passengers').set('Origin', STAFF_ORIGIN).expect(401)

    expect(res.headers['access-control-allow-origin']).toBe(STAFF_ORIGIN)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
})
