import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AircraftTypeController } from './aircraft-type.controller'
import { AircraftTypeService } from './aircraft-type.service'
import { AircraftController } from './aircraft.controller'
import { AircraftService } from './aircraft.service'
import { CurrentStaffService } from './current-staff.service'
import { FleetController } from './fleet.controller'
import { FleetService } from './fleet.service'
import { TurnaroundController } from './turnaround.controller'
import { TurnaroundService } from './turnaround.service'

// ESM-only dependencies that Jest cannot load here; the controllers under test never call into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const ID = '3f2c1b4a-8d5e-4c7a-9b1d-2e6f7a8b9c0d'

/**
 * The requirement document makes every route staff-only, except the seat map and the capacity, which Features 3b, 6, 10
 * and 17 read with a customer token. These tests call every route as a signed-in account without a staff record.
 */
describe('staff-only access to the aircraft management routes', () => {
  let app: INestApplication
  const anything = jest.fn().mockResolvedValue({})

  beforeAll(async () => {
    // Every method answers with an empty object. `then` must stay undefined, or Nest would await the provider as a promise.
    const proxy = new Proxy({}, { get: (_target, prop) => (prop === 'then' || typeof prop === 'symbol' ? undefined : anything) })

    const moduleRef = await Test.createTestingModule({
      controllers: [AircraftController, AircraftTypeController, TurnaroundController, FleetController],
      providers: [
        { provide: AircraftService, useValue: proxy },
        { provide: AircraftTypeService, useValue: proxy },
        { provide: TurnaroundService, useValue: proxy },
        { provide: FleetService, useValue: proxy },
        { provide: CurrentStaffService, useValue: { isStaff: jest.fn().mockResolvedValue(false), resolveStaffId: jest.fn() } },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    // Stands in for the global JwtAuthGuard: the caller is signed in, but has no staff record.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 'customer-1', email: 'customer@example.com' }
      next()
    })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  const send = (method: string, path: string) =>
    (request(app.getHttpServer()) as unknown as Record<string, (p: string) => request.Test>)[method](path)

  it.each([
    ['get', '/aircraft'],
    ['get', '/aircraft/available'],
    ['get', '/aircraft/status-changes'],
    ['get', `/aircraft/${ID}`],
    ['get', `/aircraft/${ID}/status`],
    ['get', `/aircraft/${ID}/status/history`],
    ['get', `/aircraft/${ID}/availability`],
    ['get', `/aircraft/${ID}/maintenance`],
    ['get', `/aircraft/${ID}/operating-days`],
    ['post', '/aircraft'],
    ['put', `/aircraft/${ID}`],
    ['post', `/aircraft/${ID}/status`],
    ['delete', `/aircraft/${ID}/status/${ID}`],
    ['post', `/aircraft/${ID}/maintenance`],
    ['put', `/aircraft/${ID}/maintenance/${ID}`],
    ['put', `/aircraft/${ID}/operating-days`],
    ['get', '/aircraft-types'],
    ['get', `/aircraft-types/${ID}`],
    ['post', '/aircraft-types'],
    ['put', `/aircraft-types/${ID}`],
    ['post', `/aircraft-types/${ID}/clone`],
    ['post', `/aircraft/${ID}/turnarounds`],
    ['get', `/aircraft/${ID}/turnarounds/latest`],
    ['put', `/turnarounds/${ID}/tasks/${ID}`],
    ['get', '/fleet/reserve'],
    ['get', '/fleet/settings'],
    ['put', '/fleet/settings/reserve_ratio'],
  ])('answers 403 to an account without a staff record for %s %s', async (method, path) => {
    const response = await send(method, path)

    expect(response.status).toBe(403)
  })

  it.each([
    ['get', `/aircraft/${ID}/seat-map`],
    ['get', `/aircraft/${ID}/capacity`],
  ])('lets any signed-in account call %s %s', async (method, path) => {
    const response = await send(method, path)

    expect(response.status).toBe(200)
  })
})
