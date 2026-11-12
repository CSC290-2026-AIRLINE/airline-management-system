import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { StaffAssistanceController } from './staff-assistance.controller'
import { StaffAssistanceService } from './staff-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('./staff-assistance.service', () => ({ StaffAssistanceService: class {} }))

describe('StaffAssistanceController', () => {
  let app: INestApplication
  const list = jest.fn()
  const review = jest.fn()
  const id = '00000000-0000-4000-8000-000000000001'

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StaffAssistanceController],
      providers: [
        { provide: StaffAssistanceService, useValue: { list, review } },
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user', email: 'test@example.com' }) } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalFilters(new BookingErrorFilter())
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => {
    list.mockReset()
    review.mockReset()
  })

  it('requires a signed-in user', async () => {
    await request(app.getHttpServer()).get('/api/staff/service-requests').expect(401)
    expect(list).not.toHaveBeenCalled()
  })

  it('passes verified user identity and valid filters to the staff service', async () => {
    list.mockResolvedValue([])
    await request(app.getHttpServer())
      .get(`/api/staff/service-requests?status=requested&flightId=${id}`)
      .set('Authorization', 'Bearer token')
      .expect(200)
    expect(list).toHaveBeenCalledWith('user', { status: 'requested', flightId: id })
  })

  it('rejects unexpected fields and invalid statuses', async () => {
    await request(app.getHttpServer()).get('/api/staff/service-requests?status=invalid').set('Authorization', 'Bearer token').expect(422)
    await request(app.getHttpServer())
      .put(`/api/staff/service-requests/${id}`)
      .set('Authorization', 'Bearer token')
      .send({ status: 'accepted', staffId: 'other' })
      .expect(422)
    expect(list).not.toHaveBeenCalled()
    expect(review).not.toHaveBeenCalled()
  })

  it('forwards a review with the authenticated user', async () => {
    review.mockResolvedValue({ serviceRequestId: id, status: 'rejected' })
    await request(app.getHttpServer())
      .put(`/api/staff/service-requests/${id}`)
      .set('Authorization', 'Bearer token')
      .send({ status: 'rejected', decisionNote: 'No equipment' })
      .expect(200)
    expect(review).toHaveBeenCalledWith('user', id, 'rejected', 'No equipment')
  })
})
