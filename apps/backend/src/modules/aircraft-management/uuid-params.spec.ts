import { type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AircraftTypeController } from './aircraft-type.controller'
import { AircraftTypeService } from './aircraft-type.service'
import { AircraftController } from './aircraft.controller'
import { AircraftService } from './aircraft.service'
import { CurrentStaffService } from './current-staff.service'
import { StaffGuard } from './staff.guard'
import { TurnaroundController } from './turnaround.controller'
import { TurnaroundService } from './turnaround.service'

// ESM-only dependencies that Jest cannot load here; the controllers under test never call into them.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const VALID_ID = '3f2c1b4a-8d5e-4c7a-9b1d-2e6f7a8b9c0d'

describe('path parameters of the aircraft management routes', () => {
  let app: INestApplication
  let aircraftService: { findOne: jest.Mock; removeStatus: jest.Mock; getStatusChanges: jest.Mock }
  let aircraftTypeService: { findOne: jest.Mock }
  let turnaroundService: { updateTask: jest.Mock }

  beforeAll(async () => {
    aircraftService = {
      findOne: jest.fn().mockResolvedValue({ id: VALID_ID }),
      removeStatus: jest.fn(),
      getStatusChanges: jest.fn().mockResolvedValue([]),
    }
    aircraftTypeService = { findOne: jest.fn().mockResolvedValue({ id: VALID_ID }) }
    turnaroundService = { updateTask: jest.fn() }

    const moduleRef = await Test.createTestingModule({
      controllers: [AircraftController, AircraftTypeController, TurnaroundController],
      providers: [
        { provide: AircraftService, useValue: aircraftService },
        { provide: AircraftTypeService, useValue: aircraftTypeService },
        { provide: TurnaroundService, useValue: turnaroundService },
        { provide: CurrentStaffService, useValue: { isStaff: jest.fn().mockResolvedValue(true) } },
      ],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    ['GET', '/aircraft/not-a-uuid'],
    ['GET', '/aircraft-types/not-a-uuid'],
    ['DELETE', `/aircraft/${VALID_ID}/status/not-a-uuid`],
    ['PUT', `/turnarounds/${VALID_ID}/tasks/not-a-uuid`],
  ])('answers 400, not 500, for %s %s', async (method, path) => {
    const response = await request(app.getHttpServer())[method.toLowerCase() as 'get' | 'put' | 'delete'](path)

    expect(response.status).toBe(400)
  })

  it('answers an error as { error: { code, message } }', async () => {
    const response = await request(app.getHttpServer()).get('/aircraft/not-a-uuid')

    expect(response.body).toEqual({ error: { code: 'bad_request', message: expect.stringContaining('uuid') as string } })
  })

  it('answers 204 to cancelling a status record', async () => {
    const response = await request(app.getHttpServer()).delete(`/aircraft/${VALID_ID}/status/${VALID_ID}`)

    expect(response.status).toBe(204)
    expect(aircraftService.removeStatus).toHaveBeenCalledWith(VALID_ID, VALID_ID)
  })

  it('lets a valid id through to the service', async () => {
    const response = await request(app.getHttpServer()).get(`/aircraft/${VALID_ID}`)

    expect(response.status).toBe(200)
    expect(aircraftService.findOne).toHaveBeenCalledWith(VALID_ID)
  })

  it('does not treat the literal routes as ids', async () => {
    aircraftService.findOne.mockClear()

    const response = await request(app.getHttpServer()).get('/aircraft/status-changes?since=2026-01-01T00:00:00.000Z')

    expect(response.status).toBe(200)
    expect(aircraftService.getStatusChanges).toHaveBeenCalled()
    expect(aircraftService.findOne).not.toHaveBeenCalled()
  })
})
