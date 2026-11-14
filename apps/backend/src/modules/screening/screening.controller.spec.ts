import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { ScreeningCheckController, ScreeningController } from './screening.controller'
import { ScreeningCheckService } from './screening-check.service'
import { ScreeningService } from './screening.service'
import { CheckPipe, QueuePipe, ReviewPipe } from './dto/screening.dto'
import { checkId, flightId, passengerId, userId } from './screening.test-fixtures'

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('Screening HTTP boundary with the existing JWT guard', () => {
  let app: INestApplication
  const service = { list: jest.fn(), detail: jest.fn(), review: jest.fn() }
  const checks = { check: jest.fn(), status: jest.fn() }
  const verifier = jest.fn()
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ScreeningController, ScreeningCheckController],
      providers: [
        CheckPipe,
        QueuePipe,
        ReviewPipe,
        { provide: ScreeningService, useValue: service },
        { provide: ScreeningCheckService, useValue: checks },
        { provide: JwtService, useValue: { verifyAsync: verifier } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    await app.init()
  })
  beforeEach(() => {
    jest.resetAllMocks()
    verifier.mockResolvedValue({ sub: userId, email: 'synthetic@example.test' })
    service.list.mockResolvedValue({ items: [] })
    service.review.mockResolvedValue({ revision: 1 })
    checks.check.mockResolvedValue({ outcome: 'clear' })
  })
  afterAll(async () => {
    await app.close()
  })
  it('requires authentication on list, detail, check, status and review routes', async () => {
    await request(app.getHttpServer()).get('/api/security/screenings').expect(401)
    await request(app.getHttpServer()).get(`/api/security/screenings/${checkId}`).expect(401)
    await request(app.getHttpServer()).post('/api/screening/check').expect(401)
    await request(app.getHttpServer()).get(`/api/screening/status/${passengerId}/${flightId}`).expect(401)
    await request(app.getHttpServer()).post(`/api/security/screenings/${checkId}/reviews`).expect(401)
  })
  it('rejects expired tokens without dispatching to the service', async () => {
    verifier.mockRejectedValue(new Error('expired'))
    await request(app.getHttpServer()).get('/api/security/screenings').set('Authorization', 'Bearer synthetic').expect(401)
    expect(service.list).not.toHaveBeenCalled()
  })
  it('passes the authenticated identity, validates query fields and rejects forged actor IDs', async () => {
    await request(app.getHttpServer())
      .get('/api/security/screenings?status=held&limit=2')
      .set('Authorization', 'Bearer synthetic')
      .expect(200)
    expect(service.list).toHaveBeenCalledWith(userId, expect.objectContaining({ status: 'held', limit: 2 }))
    await request(app.getHttpServer())
      .post('/api/screening/check')
      .set('Authorization', 'Bearer synthetic')
      .send({ passengerId, flightId, triggerPoint: 'booking', staffId: 'forged' })
      .expect(400)
    expect(checks.check).not.toHaveBeenCalled()
  })
  it('requires explicit passport comparison and a revision, and trims the accepted note', async () => {
    const body = { decision: 'false_positive', note: ' Compared passport ', passportCompared: true, expectedRevision: 0 }
    await request(app.getHttpServer())
      .post(`/api/security/screenings/${checkId}/reviews`)
      .set('Authorization', 'Bearer synthetic')
      .send({ ...body, passportCompared: false })
      .expect(400)
    await request(app.getHttpServer())
      .post(`/api/security/screenings/${checkId}/reviews`)
      .set('Authorization', 'Bearer synthetic')
      .send(body)
      .expect(201)
    expect(service.review).toHaveBeenCalledWith(userId, checkId, { ...body, note: 'Compared passport' })
  })
})
