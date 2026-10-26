import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'
import { DbModule } from '@backend/db/db.module'
import { ScreeningModule } from './screening.module'
import { ScreeningClock } from './screening.context'
import { ScreeningMatcher } from './screening.matcher'
import {
  checkFixture,
  reviewFixture,
  passengerFixture,
  now,
  checkId,
  flightId,
  passengerId,
  staffId,
  userId,
} from './screening.test-fixtures'

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('Screening authorization through the JWT guard and real services', () => {
  let app: INestApplication
  const verifier = jest.fn()
  const account = () => ({
    id: staffId,
    user_id: userId,
    deleted_at: null as Date | null,
    role: { code: 'security' },
    user: { type: 'staff', disabled_at: null as Date | null, deleted_at: null as Date | null },
  })
  let caller: ReturnType<typeof account> | null
  const tx = {
    staff: { findFirst: jest.fn() },
    passenger: { findFirst: jest.fn() },
    flight: { findUnique: jest.fn() },
    screening_check: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    screening_review: { create: jest.fn() },
    audit_log: { create: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  }
  const routes = [
    { method: 'get', path: '/api/security/screenings', body: undefined, status: 200 },
    { method: 'get', path: `/api/security/screenings/${checkId}`, body: undefined, status: 200 },
    { method: 'post', path: '/api/screening/check', body: { passengerId, flightId, triggerPoint: 'booking' }, status: 201 },
    { method: 'get', path: `/api/screening/status/${passengerId}/${flightId}`, body: undefined, status: 200 },
    {
      method: 'post',
      path: `/api/security/screenings/${checkId}/reviews`,
      body: { decision: 'false_positive', note: 'Passport compared', passportCompared: true, expectedRevision: 0 },
      status: 201,
    },
  ] as const
  function send(route: (typeof routes)[number], authenticated = true) {
    const call = request(app.getHttpServer())[route.method](route.path)
    if (authenticated) call.set('Authorization', 'Bearer synthetic')
    if (route.body) call.send(route.body)
    return call
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [DbModule, ScreeningModule],
      providers: [
        { provide: JwtService, useValue: { verifyAsync: verifier } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    })
      .overrideProvider(DbService)
      .useValue({ $transaction: (work: (client: unknown) => Promise<unknown>) => work(tx) })
      .overrideProvider(ScreeningClock)
      .useValue({ now: () => now })
      .overrideProvider(ScreeningMatcher)
      .useValue({ match: jest.fn().mockResolvedValue([]) })
      .compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    caller = account()
    verifier.mockResolvedValue({ sub: userId, email: 'synthetic@example.test' })
    // Model Prisma's filtering so removing an eligibility predicate makes the rejection tests fail.
    tx.staff.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (!caller) return null
      const userWhere = where.user as Record<string, unknown>
      const eligible =
        caller.user_id === where.user_id &&
        caller.deleted_at === where.deleted_at &&
        Object.entries(userWhere).every(([key, value]) => caller!.user[key as keyof typeof caller.user] === value)
      return eligible ? { id: caller.id, role: caller.role } : null
    })
    const flight = {
      id: flightId,
      flight_number: 'FD 330',
      dep_at: new Date(now.getTime() + 3600000),
      status: 'scheduled',
      route: { origin: 'BKK', destination: 'RGN' },
    }
    tx.passenger.findFirst.mockResolvedValue(passengerFixture())
    tx.flight.findUnique.mockResolvedValue(flight)
    tx.screening_check.findUnique.mockResolvedValue({ ...checkFixture(), flight, screening_review: [], watchlist_entry: null })
    tx.screening_check.findFirst.mockResolvedValue(null)
    tx.screening_check.findMany.mockResolvedValue([])
    tx.screening_check.create.mockResolvedValue({ id: checkId })
    tx.screening_review.create.mockResolvedValue({ ...reviewFixture(), staff: { first_name: 'Test', last_name: 'Reviewer' } })
    tx.audit_log.findMany.mockResolvedValue([])
    tx.$queryRaw.mockResolvedValue([])
  })
  afterAll(async () => {
    await app?.close()
  })

  it.each(routes)('rejects a missing token on $method $path', async (route) => {
    await send(route, false).expect(401)
    expect(tx.staff.findFirst).not.toHaveBeenCalled()
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })
  it.each(routes)('rejects invalid tokens on $method $path before database access', async (route) => {
    verifier.mockRejectedValue(new Error('Invalid token'))
    await send(route).expect(401)
    expect(tx.staff.findFirst).not.toHaveBeenCalled()
  })
  it.each(['role', 'userId', 'actorId', 'staffId'])('rejects a forged %s on check and review requests', async (field) => {
    for (const route of routes.filter((item) => item.method === 'post')) {
      await request(app.getHttpServer())
        .post(route.path)
        .set('Authorization', 'Bearer synthetic')
        .send({ ...route.body, [field]: 'forged' })
        .expect(400)
    }
    expect(tx.screening_check.create).not.toHaveBeenCalled()
    expect(tx.screening_review.create).not.toHaveBeenCalled()
    expect(tx.audit_log.create).not.toHaveBeenCalled()
  })
  it.each(['missing staff', 'admin', 'check_in', 'customer', 'disabled user', 'deleted user', 'deleted staff'])(
    'rejects %s on every endpoint before business reads or writes',
    async (scenario) => {
      if (scenario === 'missing staff') caller = null
      else if (scenario === 'admin' || scenario === 'check_in') caller!.role.code = scenario
      else if (scenario === 'customer') caller!.user.type = 'customer'
      else if (scenario === 'disabled user') caller!.user.disabled_at = now
      else if (scenario === 'deleted user') caller!.user.deleted_at = now
      else caller!.deleted_at = now
      for (const route of routes) await send(route).expect(403)
      expect(tx.staff.findFirst).toHaveBeenCalledTimes(routes.length)
      expect(tx.passenger.findFirst).not.toHaveBeenCalled()
      expect(tx.screening_check.findUnique).not.toHaveBeenCalled()
      expect(tx.$queryRaw).not.toHaveBeenCalled()
      expect(tx.screening_review.create).not.toHaveBeenCalled()
      expect(tx.audit_log.create).not.toHaveBeenCalled()
    },
  )
  it.each(routes)('allows active security on $method $path with the authenticated audit actor', async (route) => {
    tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValue([{ held: 0, flagged: 0, decided: 0 }])
    if (route.path !== '/api/security/screenings') tx.$queryRaw.mockResolvedValue([])
    await send(route).expect(route.status)
    expect(tx.staff.findFirst).toHaveBeenCalledWith({
      where: { user_id: userId, deleted_at: null, user: { type: 'staff', disabled_at: null, deleted_at: null } },
      select: { id: true, role: { select: { code: true } } },
    })
    expect(tx.audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actor_id: userId, actor_role: 'security' }),
      }),
    )
    if (route.path.endsWith('/reviews'))
      expect(tx.screening_review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewed_by_staff_id: staffId }),
        }),
      )
  })
})
