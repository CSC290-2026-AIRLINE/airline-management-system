import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { BookingAssistanceController } from './booking-assistance.controller'
import { BookingAssistanceService } from './booking-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('./booking-assistance.service', () => ({ BookingAssistanceService: class {} }))

describe('BookingAssistanceController', () => {
  let app: INestApplication
  const requestForUser = jest.fn()
  const passengerId = '00000000-0000-4000-8000-000000000001'
  const url = '/api/bookings/ABC123/service-requests'

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingAssistanceController],
      providers: [
        { provide: BookingAssistanceService, useValue: { requestForUser } },
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
  beforeEach(() => requestForUser.mockReset())

  it('requires a signed-in user', async () => {
    await request(app.getHttpServer()).post(url).send({ bookingPassengerId: passengerId, serviceCode: 'WCHR' }).expect(401)
    expect(requestForUser).not.toHaveBeenCalled()
  })

  it('passes the signed-in identity and the valid request to the service', async () => {
    requestForUser.mockResolvedValue(undefined)
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer token')
      .send({ bookingPassengerId: passengerId, serviceCode: 'WCHR' })
      .expect(201)
    expect(requestForUser).toHaveBeenCalledWith('ABC123', 'user', { bookingPassengerId: passengerId, serviceCode: 'WCHR' })
  })

  it('rejects unsupported STCR and caller-supplied staff identity', async () => {
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer token')
      .send({ bookingPassengerId: passengerId, serviceCode: 'STCR' })
      .expect(422)
    await request(app.getHttpServer())
      .post(url)
      .set('Authorization', 'Bearer token')
      .send({ bookingPassengerId: passengerId, serviceCode: 'WCHR', staff: true })
      .expect(422)
    expect(requestForUser).not.toHaveBeenCalled()
  })
})
