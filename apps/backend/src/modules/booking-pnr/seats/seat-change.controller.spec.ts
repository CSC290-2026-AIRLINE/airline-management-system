import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { SeatChangeController } from './seat-change.controller'
import { SeatChangeService } from './seat-change.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('../providers/checkin-seat.provider', () => ({ CheckinSeatProvider: class {} }))

describe('SeatChangeController', () => {
  let app: INestApplication
  const changeSeatForUser = jest.fn()
  const coupon = '00000000-0000-4000-8000-000000000001'
  const url = `/api/bookings/ABC123/coupons/${coupon}/seat`

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SeatChangeController],
      providers: [
        { provide: SeatChangeService, useValue: { changeSeatForUser } },
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
  beforeEach(() => changeSeatForUser.mockReset())

  it('requires authentication', async () => {
    await request(app.getHttpServer()).put(url).send({ seatCode: '12A' }).expect(401)
    expect(changeSeatForUser).not.toHaveBeenCalled()
  })

  it('derives identity from the access token and forwards a valid seat', async () => {
    changeSeatForUser.mockResolvedValue({ status: 'assigned', seat: { seatCode: '12A' } })
    await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer token').send({ seatCode: '12A' }).expect(200)
    expect(changeSeatForUser).toHaveBeenCalledWith('ABC123', coupon, '12A', 'user')
  })

  it('rejects invalid seat codes and unexpected viewer fields', async () => {
    await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer token').send({ seatCode: '0A' }).expect(422)
    await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer token').send({ seatCode: '12A', staff: true }).expect(422)
    expect(changeSeatForUser).not.toHaveBeenCalled()
  })

  it('returns the Feature 3 error format for an invalid coupon id', async () => {
    const response = await request(app.getHttpServer())
      .put('/api/bookings/ABC123/coupons/not-a-uuid/seat')
      .set('Authorization', 'Bearer token')
      .send({ seatCode: '12A' })
      .expect(422)
    expect(response.body).toMatchObject({ error: { code: 'INVALID_BOOKING_STATE' } })
    expect(changeSeatForUser).not.toHaveBeenCalled()
  })
})
