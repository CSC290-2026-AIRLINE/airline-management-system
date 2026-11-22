import type { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard'
import { SeatMapController } from './seat-map.controller'
import { SeatMapService } from './seat-map.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class DbService {} }))
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }))

describe('SeatMapController', () => {
  let app: INestApplication
  const getSeatMap = jest.fn()
  const flightId = '00000000-0000-4000-8000-000000000001'

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SeatMapController],
      providers: [
        { provide: SeatMapService, useValue: { getSeatMap } },
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: 'customer-id', email: 'test@example.com' }) } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile()
    app = module.createNestApplication()
    app.setGlobalPrefix('api')
    // Listen on loopback ourselves: a wildcard port picked by supertest can be shadowed by another local app.
    await app.listen(0, '127.0.0.1')
  })

  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    getSeatMap.mockReset()
  })

  it('requires a signed-in user', async () => {
    await request(app.getHttpServer()).get(`/api/bookings/flights/${flightId}/seat-map`).expect(401)
    expect(getSeatMap).not.toHaveBeenCalled()
  })

  it('returns the seat map for a signed-in user', async () => {
    const map = { flightId, cabins: [], rows: [] }
    getSeatMap.mockResolvedValue(map)
    await request(app.getHttpServer())
      .get(`/api/bookings/flights/${flightId}/seat-map`)
      .set('Authorization', 'Bearer test-token')
      .expect(200, map)
    expect(getSeatMap).toHaveBeenCalledWith(flightId)
  })

  it('rejects a malformed flight ID', async () => {
    await request(app.getHttpServer())
      .get('/api/bookings/flights/not-a-uuid/seat-map')
      .set('Authorization', 'Bearer test-token')
      .expect(400)
    expect(getSeatMap).not.toHaveBeenCalled()
  })
})
