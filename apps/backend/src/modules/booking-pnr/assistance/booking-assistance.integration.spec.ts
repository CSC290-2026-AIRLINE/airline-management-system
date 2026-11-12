import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { BOOKING_CLOCK, BOOKING_EVENT_BUS, BOOKING_READ_PORT, SEAT_MAP_PORT } from '../contracts'
import { AssistanceService } from './assistance.service'
import { BookingAssistanceController } from './booking-assistance.controller'
import { BookingAssistanceService } from './booking-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

describe('Customer assistance flow', () => {
  let app: INestApplication
  const passengerId = '00000000-0000-4000-8000-000000000001'
  const segmentId = '00000000-0000-4000-8000-000000000002'
  const now = new Date('2026-11-11T00:00:00Z')
  const events = { publish: jest.fn() }
  const create = jest.fn()
  const findFlight = jest.fn()
  const db = {
    customer: {
      findFirst: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(where.user_id === 'owner' ? { id: 'customer' } : null),
      ),
    },
    staff: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([{ status: 'confirmed' }]),
    booking_passenger: { findFirst: jest.fn().mockResolvedValue({ passenger: { date_of_birth: new Date('1990-01-01T00:00:00Z') } }) },
    booking_segment: { findMany: jest.fn().mockResolvedValue([{ id: segmentId, flight_id: 'flight' }]) },
    flight: { findMany: findFlight },
    seat_assignment: { findMany: jest.fn().mockResolvedValue([]) },
    booking_service_request: { findFirst: jest.fn().mockResolvedValue(null), create },
    $transaction: jest.fn(async (run: (transaction: unknown) => Promise<unknown>) => run(db)),
  }
  const booking = {
    bookingId: 'booking',
    reference: 'ABC123',
    customerId: 'customer',
    segments: [{ bookingSegmentId: segmentId, flightId: 'flight' }],
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingAssistanceController],
      providers: [
        BookingAssistanceService,
        AssistanceService,
        { provide: DbService, useValue: db },
        { provide: BOOKING_CLOCK, useValue: { now: () => now } },
        { provide: BOOKING_EVENT_BUS, useValue: events },
        {
          provide: BOOKING_READ_PORT,
          useValue: {
            getBookingDetail: jest.fn((_reference: string, viewer: { customerId?: string }) =>
              Promise.resolve(viewer.customerId === 'customer' ? booking : null),
            ),
          },
        },
        { provide: SEAT_MAP_PORT, useValue: { getSeatMap: jest.fn() } },
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
    events.publish.mockReset().mockResolvedValue(undefined)
    create.mockReset().mockResolvedValue({})
    findFlight.mockReset().mockResolvedValue([{ id: 'flight', dep_at: new Date('2026-11-13T00:00:00Z'), service_date: now }])
  })
  afterAll(async () => app.close())

  it('lets the booking owner request assistance and publishes the update', async () => {
    await request(app.getHttpServer())
      .post('/api/bookings/ABC123/service-requests')
      .set('Authorization', 'Bearer owner')
      .send({ bookingPassengerId: passengerId, bookingSegmentId: segmentId, serviceCode: 'WCHR' })
      .expect(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ service_code: 'WCHR', requested_at: now }) }),
    )
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'service_request.updated', bookingId: 'booking' }))
  })

  it('does not let another customer submit a request', async () => {
    await request(app.getHttpServer())
      .post('/api/bookings/ABC123/service-requests')
      .set('Authorization', 'Bearer other')
      .send({ bookingPassengerId: passengerId, serviceCode: 'WCHR' })
      .expect(404)
    expect(create).not.toHaveBeenCalled()
    expect(events.publish).not.toHaveBeenCalled()
  })

  it('rejects late wheelchair requests without saving or publishing', async () => {
    findFlight.mockResolvedValue([{ id: 'flight', dep_at: new Date('2026-11-11T23:00:00Z'), service_date: now }])
    const response = await request(app.getHttpServer())
      .post('/api/bookings/ABC123/service-requests')
      .set('Authorization', 'Bearer owner')
      .send({ bookingPassengerId: passengerId, serviceCode: 'WCHR' })
      .expect(409)
    expect(response.body).toMatchObject({ error: { code: 'ASSISTANCE_TOO_LATE' } })
    expect(create).not.toHaveBeenCalled()
    expect(events.publish).not.toHaveBeenCalled()
  })
})
