import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { DbService } from '@backend/db/db.service'
import { BookingErrorFilter } from '../common/booking-error.filter'
import { BOOKING_CLOCK, BOOKING_EVENT_BUS, BOOKING_READ_PORT, SEAT_MAP_PORT } from '../contracts'
import { AssistanceQueueService } from './assistance-queue.service'
import { AssistanceService } from './assistance.service'
import { StaffAssistanceController } from './staff-assistance.controller'
import { StaffAssistanceService } from './staff-assistance.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }))

describe('Staff assistance flow', () => {
  let app: INestApplication
  let status = 'requested'
  const id = '00000000-0000-4000-8000-000000000001'
  const now = new Date('2026-11-11T00:00:00Z')
  const events = { publish: jest.fn() }
  const record = () => ({
    id,
    booking_id: 'booking',
    booking_passenger_id: 'passenger',
    booking_segment_id: 'segment',
    service_code: 'WCHR',
    note: null,
    decision_note: null,
    requested_at: now,
    status,
  })
  const db = {
    staff: {
      findFirst: jest.fn(({ where }: { where: { user_id: string } }) =>
        Promise.resolve(where.user_id === 'staff-user' ? { id: 'staff' } : null),
      ),
    },
    booking_service_request: {
      findMany: jest.fn(() => Promise.resolve([record()])),
      findUnique: jest.fn(() => Promise.resolve(record())),
      updateMany: jest.fn(({ where, data }: { where: { status: string }; data: { status: string } }) => {
        if (status !== where.status) return Promise.resolve({ count: 0 })
        status = data.status
        return Promise.resolve({ count: 1 })
      }),
    },
    $transaction: jest.fn(async (run: (transaction: unknown) => Promise<unknown>) => run(db)),
  }
  const booking = {
    bookingId: 'booking',
    reference: 'ABC123',
    customerId: 'customer',
    passengers: [{ bookingPassengerId: 'passenger', firstName: 'Alex', lastName: 'Example', passengerType: 'adult' }],
    segments: [{ bookingSegmentId: 'segment', flightId: 'flight', flightNumber: 'FT100', depAt: now }],
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StaffAssistanceController],
      providers: [
        StaffAssistanceService,
        AssistanceQueueService,
        AssistanceService,
        { provide: DbService, useValue: db },
        { provide: BOOKING_CLOCK, useValue: { now: () => now } },
        { provide: BOOKING_EVENT_BUS, useValue: events },
        { provide: BOOKING_READ_PORT, useValue: { getBookingForPassenger: jest.fn().mockResolvedValue(booking) } },
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
    status = 'requested'
    events.publish.mockReset().mockResolvedValue(undefined)
  })
  afterAll(async () => app.close())

  it('denies a customer before exposing assistance requests', async () => {
    await request(app.getHttpServer()).get('/api/staff/service-requests').set('Authorization', 'Bearer customer-user').expect(403)
  })

  it('lets staff read, accept and complete a request and publishes both updates', async () => {
    const listing = await request(app.getHttpServer())
      .get('/api/staff/service-requests')
      .set('Authorization', 'Bearer staff-user')
      .expect(200)
    expect(listing.body).toEqual([expect.objectContaining({ serviceRequestId: id, status: 'requested', bookingReference: 'ABC123' })])
    await request(app.getHttpServer())
      .put(`/api/staff/service-requests/${id}`)
      .set('Authorization', 'Bearer staff-user')
      .send({ status: 'accepted' })
      .expect(200)
    await request(app.getHttpServer())
      .put(`/api/staff/service-requests/${id}`)
      .set('Authorization', 'Bearer staff-user')
      .send({ status: 'completed' })
      .expect(200)
    expect(status).toBe('completed')
    expect(events.publish).toHaveBeenCalledTimes(2)
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'service_request.updated', bookingId: 'booking' }))
  })
})
