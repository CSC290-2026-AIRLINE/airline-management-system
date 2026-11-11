import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { BOOKING_READ_PORT } from '../contracts'
import { CheckinSeatProvider } from '../providers/checkin-seat.provider'
import { SeatChangeController } from './seat-change.controller'
import { SeatChangeService } from './seat-change.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))
jest.mock('../providers/checkin-seat.provider', () => ({ CheckinSeatProvider: class {} }))

describe('Customer seat-change flow', () => {
  let app: INestApplication
  const couponId = '00000000-0000-4000-8000-000000000001'
  const url = `/api/bookings/ABC123/coupons/${couponId}/seat`
  const checkIn = { findFirst: jest.fn() }
  const db = {
    customer: {
      findFirst: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(where.user_id === 'owner' ? { id: 'customer' } : null),
      ),
    },
    check_in: checkIn,
  }
  const seats = { hold: jest.fn(), confirm: jest.fn(), release: jest.fn() }
  const bookings = {
    getBookingDetail: jest.fn((_reference: string, viewer: { customerId?: string }) =>
      Promise.resolve(
        viewer.customerId === 'customer'
          ? { status: 'confirmed', coupons: [{ couponId, status: 'confirmed', flightId: 'flight', bookingPassengerId: 'passenger' }] }
          : null,
      ),
    ),
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SeatChangeController],
      providers: [
        SeatChangeService,
        { provide: DbService, useValue: db },
        { provide: CheckinSeatProvider, useValue: seats },
        { provide: BOOKING_READ_PORT, useValue: bookings },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn((token: string) => Promise.resolve({ sub: token, email: 'test@example.com' })) },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalFilters(new BookingErrorFilter())
    await app.init()
  })
  beforeEach(() => {
    checkIn.findFirst.mockReset().mockResolvedValue(null)
    seats.hold.mockReset().mockResolvedValue({ id: 'lock', fee: 0 })
    seats.confirm.mockReset().mockResolvedValue({ seatCode: '4A', type: 'standard' })
    seats.release.mockReset().mockResolvedValue(undefined)
  })
  afterAll(async () => app.close())

  it('lets the booking owner assign a free seat', async () => {
    const response = await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer owner').send({ seatCode: '4A' }).expect(200)
    expect(response.body).toMatchObject({ status: 'assigned', seat: { seatCode: '4A' } })
    expect(seats.confirm).toHaveBeenCalledWith('lock', { rejectCheckedIn: true })
  })

  it('does not let another customer choose a seat', async () => {
    await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer other').send({ seatCode: '4A' }).expect(404)
    expect(seats.hold).not.toHaveBeenCalled()
  })

  it('refuses a seat change after check-in', async () => {
    checkIn.findFirst.mockResolvedValue({ id: 'check-in' })
    const response = await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer owner').send({ seatCode: '4A' }).expect(409)
    expect(response.body).toMatchObject({ error: { code: 'BOOKING_CLOSED' } })
    expect(seats.hold).not.toHaveBeenCalled()
  })

  it('does not assign a paid seat before payment', async () => {
    seats.hold.mockResolvedValue({ id: 'lock', fee: 15 })
    const response = await request(app.getHttpServer()).put(url).set('Authorization', 'Bearer owner').send({ seatCode: '4A' }).expect(200)
    expect(response.body).toMatchObject({ status: 'payment_required' })
    expect(seats.confirm).not.toHaveBeenCalled()
  })
})
