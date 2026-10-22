import 'reflect-metadata'
import { INestApplication, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import type { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { DbModule } from '@backend/db/db.module'
import { DbService } from '@backend/db/db.service'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { WatchlistModule } from './watchlist.module'
import { WatchlistClock } from './watchlist.clock'
import type { Prisma, watchlist_entry } from '@backend/db/generated/prisma/client'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

const userId = '10000000-0000-4000-8000-000000000001'
const staffId = '20000000-0000-4000-8000-000000000001'
const entryId = '30000000-0000-4000-8000-000000000001'
const now = new Date('2026-10-22T10:00:00Z')
const row: watchlist_entry = {
  id: entryId,
  first_name: 'SOMSAK',
  last_name: 'JAIDEE',
  date_of_birth: null,
  nationality: 'th',
  passport_number: 'AB1239037',
  list_type: 'wanted',
  status: 'active',
  issuing_authority: 'Demo authority',
  reason: null,
  listed_at: now,
  cleared_at: null,
  cleared_by_staff_id: null,
  clear_reason: null,
  created_by_staff_id: staffId,
  created_at: now,
  updated_at: now,
}

describe('Watchlist HTTP contract', () => {
  let app: INestApplication
  const tx = {
    watchlist_entry: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    audit_log: { create: jest.fn() },
  }
  const db = { staff: { findFirst: jest.fn() }, $transaction: jest.fn() }
  const payload = {
    firstName: '  Somsak  ',
    lastName: 'Jaidee',
    listType: 'wanted',
    issuingAuthority: '  Demo authority  ',
    nationality: ' TH ',
    passportNumber: 'ab-123 9037',
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [DbModule, WatchlistModule] })
      .overrideProvider(DbService)
      .useValue(db)
      .overrideProvider(WatchlistClock)
      .useValue({ now: () => now })
      .compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    const jwt = {
      verifyAsync: jest.fn((token: string) =>
        token === 'valid' ? Promise.resolve({ sub: userId, email: 'security@example.test' }) : Promise.reject(new UnauthorizedException()),
      ),
    }
    app.useGlobalGuards(new JwtAuthGuard(new Reflector(), jwt as unknown as JwtService))
    await app.init()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'security' } })
    db.$transaction.mockImplementation((work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      work(tx as unknown as Prisma.TransactionClient),
    )
    tx.watchlist_entry.findUnique.mockResolvedValue(row)
    tx.watchlist_entry.findMany.mockResolvedValue([row])
    tx.watchlist_entry.create.mockImplementation(({ data }: { data: Partial<watchlist_entry> }) => Promise.resolve({ ...row, ...data }))
    tx.watchlist_entry.update.mockImplementation(({ data }: { data: Partial<watchlist_entry> }) => Promise.resolve({ ...row, ...data }))
    tx.audit_log.create.mockResolvedValue({ id: 'audit' })
  })
  afterAll(async () => {
    await app?.close()
  })

  it('requires the existing Bearer authentication even for read routes', async () => {
    await request(app.getHttpServer()).get('/api/watchlist').expect(401)
    await request(app.getHttpServer()).get('/api/watchlist').set('Authorization', 'Bearer invalid').expect(401)
    expect(db.staff.findFirst).not.toHaveBeenCalled()
  })

  it('denies admin and customer accounts', async () => {
    db.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'admin' } })
    await request(app.getHttpServer()).get('/api/watchlist').set('Authorization', 'Bearer valid').expect(403)
    db.staff.findFirst.mockResolvedValue(null)
    await request(app.getHttpServer()).post('/api/watchlist').set('Authorization', 'Bearer valid').send(payload).expect(403)
    expect(tx.watchlist_entry.create).not.toHaveBeenCalled()
  })

  it('returns masked list data and parses pagination query parameters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/watchlist?limit=1&status=active&listType=wanted')
      .set('Authorization', 'Bearer valid')
      .expect(200)
    expect(response.body.items[0].passportMasked).toBe('•••• 9037')
    expect(response.body.items[0]).not.toHaveProperty('passportNumber')
    expect(tx.watchlist_entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2, where: { status: 'active', list_type: 'wanted' } }),
    )
  })

  it('serves all 249 nationality codes before matching the :id route', async () => {
    const response = await request(app.getHttpServer()).get('/api/watchlist/nationalities').set('Authorization', 'Bearer valid').expect(200)
    expect(response.body.codes).toHaveLength(249)
    expect(response.body.codes).toEqual(expect.arrayContaining(['th', 'hk', 'jp', 'mm']))
  })

  it('normalizes identity data on create and derives the staff id server-side', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/watchlist')
      .set('Authorization', 'Bearer valid')
      .send(payload)
      .expect(201)
    expect(response.body).toMatchObject({
      firstName: 'SOMSAK',
      lastName: 'JAIDEE',
      nationality: 'th',
      passportNumber: 'AB1239037',
      screeningStatus: 'not_connected',
    })
    expect(tx.watchlist_entry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by_staff_id: staffId, listed_at: now }),
    })
  })

  it.each([
    { status: 'cleared' },
    { createdByStaffId: staffId },
    { listedAt: '2020-01-01' },
    { unexpected: 'value' },
    { firstName: '' },
    { firstName: null },
    { nationality: 'zz' },
    { dateOfBirth: '2026-02-30' },
    { passportNumber: '•••• 9037' },
    { passportNumber: 'A'.repeat(21) },
    { listType: 'other' },
  ])('rejects invalid or mass-assigned fields: %j', async (invalid) => {
    await request(app.getHttpServer())
      .post('/api/watchlist')
      .set('Authorization', 'Bearer valid')
      .send({ ...payload, ...invalid })
      .expect(400)
    expect(tx.watchlist_entry.create).not.toHaveBeenCalled()
  })

  it('requires list type, first/last name and authority on create', async () => {
    await request(app.getHttpServer()).post('/api/watchlist').set('Authorization', 'Bearer valid').send({}).expect(400)
    const missingListType = { ...payload, listType: undefined }
    await request(app.getHttpServer()).post('/api/watchlist').set('Authorization', 'Bearer valid').send(missingListType).expect(400)
  })

  it.each(['limit=0', 'limit=101', 'limit=oops', 'status=deleted', 'listType=other', 'cursor=bad', 'unknown=value'])(
    'rejects invalid queries: %s',
    async (query) => {
      await request(app.getHttpServer()).get(`/api/watchlist?${query}`).set('Authorization', 'Bearer valid').expect(400)
    },
  )

  it('rejects malformed identifiers and empty patches', async () => {
    await request(app.getHttpServer()).get('/api/watchlist/not-a-uuid').set('Authorization', 'Bearer valid').expect(400)
    await request(app.getHttpServer()).patch(`/api/watchlist/${entryId}`).set('Authorization', 'Bearer valid').send({}).expect(400)
  })

  it('allows optional values to be cleared without accepting null required names', async () => {
    await request(app.getHttpServer())
      .patch(`/api/watchlist/${entryId}`)
      .set('Authorization', 'Bearer valid')
      .send({ nationality: '', passportNumber: null })
      .expect(200)
    expect(tx.watchlist_entry.update).toHaveBeenCalledWith({
      where: { id: entryId },
      data: expect.objectContaining({ nationality: null, passport_number: null }),
    })
    await request(app.getHttpServer())
      .patch(`/api/watchlist/${entryId}`)
      .set('Authorization', 'Bearer valid')
      .send({ firstName: null })
      .expect(400)
  })

  it('requires a clearing reason and keeps the record with its clearing metadata', async () => {
    await request(app.getHttpServer())
      .post(`/api/watchlist/${entryId}/clear`)
      .set('Authorization', 'Bearer valid')
      .send({ reason: '   ' })
      .expect(400)
    const response = await request(app.getHttpServer())
      .post(`/api/watchlist/${entryId}/clear`)
      .set('Authorization', 'Bearer valid')
      .send({ reason: ' Case withdrawn ' })
      .expect(200)
    expect(response.body).toMatchObject({ status: 'cleared', clearReason: 'Case withdrawn', clearedAt: now.toISOString() })
  })
})
