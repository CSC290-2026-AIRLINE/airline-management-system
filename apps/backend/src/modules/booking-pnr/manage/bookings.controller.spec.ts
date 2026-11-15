import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { BookingError } from '../common/booking-error'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { BookingContactService } from './booking-contact.service'
import { BookingReadService } from './booking-read.service'
import { BookingsController } from './bookings.controller'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

describe('BookingsController', () => {
  let app: INestApplication
  const updateContactForUser = jest.fn()
  const getBookingForUser = jest.fn()
  const url = '/api/bookings/ABC123/contact'

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingReadService, useValue: { getBookingForUser } },
        { provide: BookingContactService, useValue: { updateContactForUser } },
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
    updateContactForUser.mockReset()
    getBookingForUser.mockReset()
  })

  it('requires authentication', async () => {
    await request(app.getHttpServer()).patch(url).send({ contactEmail: 'new@example.com' }).expect(401)
    expect(updateContactForUser).not.toHaveBeenCalled()
  })

  it('derives identity from the access token and forwards a valid contact', async () => {
    updateContactForUser.mockResolvedValue({ contactEmail: 'new@example.com', contactPhone: '+66 2 123 4567' })
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', 'Bearer token')
      .send({ contactEmail: 'new@example.com', contactPhone: '+66 2 123 4567' })
      .expect(200)
    expect(updateContactForUser).toHaveBeenCalledWith('ABC123', { contactEmail: 'new@example.com', contactPhone: '+66 2 123 4567' }, 'user')
  })

  it('trims the contact details', async () => {
    updateContactForUser.mockResolvedValue({ contactEmail: 'new@example.com', contactPhone: null })
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', 'Bearer token')
      .send({ contactEmail: '  new@example.com  ' })
      .expect(200)
    expect(updateContactForUser).toHaveBeenCalledWith('ABC123', { contactEmail: 'new@example.com' }, 'user')
  })

  it('rejects an invalid email and unexpected fields', async () => {
    await request(app.getHttpServer()).patch(url).set('Authorization', 'Bearer token').send({ contactEmail: 'nope' }).expect(422)
    await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', 'Bearer token')
      .send({ contactEmail: 'new@example.com', staff: true })
      .expect(422)
    expect(updateContactForUser).not.toHaveBeenCalled()
  })

  it('returns the Feature 3 error format for a booking that is closed', async () => {
    updateContactForUser.mockRejectedValue(
      new BookingError('BOOKING_CLOSED', 'This booking is no longer on hold, so its contact details can no longer be changed.', 409),
    )
    const response = await request(app.getHttpServer())
      .patch(url)
      .set('Authorization', 'Bearer token')
      .send({ contactEmail: 'new@example.com' })
      .expect(409)
    expect(response.body).toMatchObject({ error: { code: 'BOOKING_CLOSED' } })
  })
})
